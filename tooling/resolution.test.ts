/**
 * The one boundary dependency-cruiser cannot hold — ADR 0007 §5.
 *
 * `@perchjs/nest` declares `@perchjs/ui` so `PanelModule` can serve its built
 * assets, and may import none of its modules. dependency-cruiser enforces the
 * second half: an `import` trips `no-adapter-to-adapter`, which the boundary
 * suite proves. But the permitted route — resolve the package root, then read
 * `dist/` off the filesystem — creates no dependency edge at all. The ADR
 * measured that: `require.resolve()` of a declared dependency produces no edge.
 *
 * So the permission gets its own guard. Every module specifier `nest` resolves
 * at runtime must be exactly the root of `@perchjs/ui`. A subpath would pin the
 * internal layout of a package that is free to change it, and any other name is
 * a boundary crossing with nothing to report it.
 *
 * Both checks read string literals, and neither evaluates an expression. What
 * escapes them: a specifier built at run time, and an absolute path — which
 * nobody writes, since it only works on the machine it was typed on. A dynamic
 * argument fails rather than passing unread; an unverifiable call is not a
 * permitted one.
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const NEST_SRC = fileURLToPath(new URL("../packages/nest/src", import.meta.url));
const ALLOWED = "@perchjs/ui";

interface ResolveCall {
  readonly file: string;
  readonly specifier: string | null;
  readonly text: string;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [path] : [];
  });
}

/** `null` specifier means the argument was not a string literal. */
function resolveCalls(file: string): ResolveCall[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
  const found: ResolveCall[] = [];
  /** Names holding a require: `const req = createRequire(url)`. */
  const requireLike = new Set<string>();
  /** Names holding the resolver itself, callable bare. */
  const bare = new Set<string>();

  const isCreateRequire = (node: ts.Expression): boolean =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "createRequire";

  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const { name, initializer } = node;
      if (ts.isIdentifier(name)) {
        if (isCreateRequire(initializer)) requireLike.add(name.text);
        // `const r = require.resolve` — the resolver without its receiver.
        else if (
          ts.isPropertyAccessExpression(initializer) &&
          initializer.name.text === "resolve" &&
          ts.isIdentifier(initializer.expression) &&
          (initializer.expression.text === "require" ||
            requireLike.has(initializer.expression.text))
        ) {
          bare.add(name.text);
        }
      } else if (ts.isObjectBindingPattern(name) && isCreateRequire(initializer)) {
        // `const { resolve } = createRequire(url)`, and its renamed form.
        for (const element of name.elements) {
          const source = element.propertyName ?? element.name;
          if (
            ts.isIdentifier(source) &&
            source.text === "resolve" &&
            ts.isIdentifier(element.name)
          ) {
            bare.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const isResolver = (expression: ts.LeftHandSideExpression): boolean => {
    if (ts.isIdentifier(expression)) return bare.has(expression.text);
    if (!ts.isPropertyAccessExpression(expression)) return false;
    if (expression.name.text !== "resolve") return false;
    const target = expression.expression;
    if (ts.isMetaProperty(target)) return true; // import.meta.resolve
    if (!ts.isIdentifier(target)) return false;
    return target.text === "require" || requireLike.has(target.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isResolver(node.expression)) {
      const argument = node.arguments[0];
      found.push({
        file,
        specifier:
          argument !== undefined && ts.isStringLiteralLike(argument)
            ? argument.text
            : null,
        text: node.getText(source),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function offences(root: string = NEST_SRC): string[] {
  return sources(root)
    .flatMap(resolveCalls)
    .filter((call) => call.specifier !== ALLOWED)
    .map((call) => `${call.file.replace(root, "nest/src")}: ${call.text}`);
}

/**
 * The other way out, and the one a hurry would take: skip the resolver and walk
 * to the file. `join(dirname(url), "../../ui/dist")` is a boundary crossing that
 * neither dependency-cruiser nor the check above can see, because it is a string.
 * Any relative path leaving the package is refused whatever it is passed to.
 */
function escapes(root: string = NEST_SRC): string[] {
  const boundary = dirname(root);
  return sources(root).flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );
    const out: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) {
        const flag =
          // A bare `..` is a segment of a path built by `join(dir, "..", "..")`,
          // which this cannot resolve because it never sees the whole path. It
          // is refused on sight: writing the path as one literal is both
          // checkable and easier to read.
          node.text === ".."
            ? true
            : /^\.\.?\//.test(node.text) &&
              relative(boundary, resolvePath(dirname(file), node.text)).startsWith(
                "..",
              );
        if (flag) out.push(`${file.replace(root, "nest/src")}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return out;
  });
}

/**
 * Fixtures go to a temporary directory, not into `packages/nest/src`. The
 * boundary suite shells out to dependency-cruiser over the whole workspace, and
 * vitest runs files in parallel: a fixture living in a real source tree would
 * make that suite fail on a schedule nobody could reproduce.
 */
function planted(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "perch-resolution-"));
  writeFileSync(join(dir, "fixture.ts"), source, "utf8");
  return dir;
}

describe("what @perchjs/nest may resolve — ADR 0007 §5", () => {
  it("passes on the workspace as committed", () => {
    expect(offences()).toEqual([]);
  });

  it("allows resolving the root of @perchjs/ui", () => {
    const dir = planted(
      `import { createRequire } from "node:module";\n` +
        `const require = createRequire(import.meta.url);\n` +
        `export const root = require.resolve("@perchjs/ui");\n`,
    );
    expect(offences(dir)).toEqual([]);
  });

  it("rejects a subpath of @perchjs/ui", () => {
    // The renderer's internal layout is its own business; pinning it here is how
    // a "just this once" turns into a contract nobody wrote down.
    const dir = planted(
      `export const p = require.resolve("@perchjs/ui/dist/index.js");\n`,
    );
    expect(offences(dir)).toHaveLength(1);
  });

  it("rejects any other package", () => {
    const dir = planted(`export const p = require.resolve("@perchjs/prisma");\n`);
    expect(offences(dir)).toHaveLength(1);
  });

  it("rejects a specifier it cannot read", () => {
    const dir = planted(`export const p = require.resolve(someName);\n`);
    expect(offences(dir)).toHaveLength(1);
  });

  it("sees through createRequire and import.meta", () => {
    const dir = planted(
      `import { createRequire } from "node:module";\n` +
        `const req = createRequire(import.meta.url);\n` +
        `export const a = req.resolve("@perchjs/prisma");\n` +
        `export const b = import.meta.resolve("@perchjs/prisma");\n`,
    );
    expect(offences(dir)).toHaveLength(2);
  });

  it("sees a resolver taken out of its receiver", () => {
    // Both found by attacking this guard rather than by reading it: neither is a
    // contortion, they are what a developer writes without thinking about it.
    const dir = planted(
      `import { createRequire } from "node:module";\n` +
        `const { resolve } = createRequire(import.meta.url);\n` +
        `const { resolve: r } = createRequire(import.meta.url);\n` +
        `const alias = require.resolve;\n` +
        `export const a = resolve("@perchjs/prisma");\n` +
        `export const b = r("@perchjs/prisma");\n` +
        `export const c = alias("@perchjs/prisma");\n`,
    );
    expect(offences(dir)).toHaveLength(3);
  });

  it("ignores resolvers that are not module resolvers", () => {
    // path.resolve and Promise.resolve are not boundary crossings, and a guard
    // that cried wolf on them would be turned off within a week.
    const dir = planted(
      `import { resolve } from "node:path";\n` +
        `import path from "node:path";\n` +
        `export const a = path.resolve("dist", "index.js");\n` +
        `export const b = resolve("dist");\n` +
        `export const c = Promise.resolve("@perchjs/prisma");\n`,
    );
    expect(offences(dir)).toEqual([]);
  });
});

describe("what @perchjs/nest may reach by path — ADR 0007, consequence 5", () => {
  it("passes on the workspace as committed", () => {
    expect(escapes()).toEqual([]);
  });

  it("rejects a relative path out of the package", () => {
    const dir = planted(
      `import { readFileSync } from "node:fs";\n` +
        `export const x = readFileSync("../../ui/dist/index.js");\n`,
    );
    expect(escapes(dir)).toHaveLength(1);
  });

  it("rejects a path climbed one segment at a time", () => {
    // The idiom that defeated the first version of this check: no single literal
    // looks like a path, so nothing matched.
    const dir = planted(
      `import { join } from "node:path";\n` +
        `export const x = join(import.meta.dirname, "..", "..", "ui", "dist");\n`,
    );
    expect(escapes(dir)).toHaveLength(2);
  });

  it("allows relative paths that stay inside", () => {
    const dir = planted(
      `export { PanelModule } from "./panel-module.js";\n` +
        `export const asset = "./assets/manifest.json";\n`,
    );
    expect(escapes(dir)).toEqual([]);
  });
});
