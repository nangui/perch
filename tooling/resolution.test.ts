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
 * at runtime must be one of the two the exports map of `@perchjs/ui` declares
 * for this purpose. An undeclared subpath would pin an internal layout the
 * renderer is free to change, and any other name is a boundary crossing with
 * nothing to report it.
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

/**
 * ADR 0007 §3 permitted the package root alone; ADR 0009 §3 adds the manifest,
 * because resolving the root throws under CommonJS and this package publishes
 * both formats. Two entries, and every other specifier still refused.
 */
const ALLOWED = new Set(["@perchjs/ui", "@perchjs/ui/manifest.json"]);

interface ResolveCall {
  readonly file: string;
  readonly specifier: string | null;
  readonly text: string;
}

/**
 * Tests are excluded, and found their way in here by failing: a test naming a
 * path it refuses to accept is data, not a boundary crossing. What ships is
 * what this guards, and tests are not in the build entry nor in `files`.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    if (/\.test\.tsx?$/.test(name)) return [];
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * The specifier a call names, or `null` when it cannot be read — which counts
 * as an offence, since an unverifiable call is not a permitted one. A `const`
 * bound to a literal in the same file is read through: naming a specifier is
 * documentation, not concealment.
 */
function specifierOf(
  argument: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (argument === undefined) return null;
  if (ts.isStringLiteralLike(argument)) return argument.text;
  if (ts.isIdentifier(argument)) return constants.get(argument.text) ?? null;
  return null;
}

/** `null` specifier means the argument could not be read. */
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
  /** `const MANIFEST = "…"` — naming a specifier is not hiding it. */
  const constants = new Map<string, string>();

  const isCreateRequire = (node: ts.Expression): boolean =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "createRequire";

  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const { name, initializer } = node;
      if (ts.isIdentifier(name)) {
        if (ts.isStringLiteralLike(initializer))
          constants.set(name.text, initializer.text);
        else if (isCreateRequire(initializer)) requireLike.add(name.text);
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
    // `createRequire(url).resolve(…)` — never bound to a name. This is the form
    // the production code uses, and the first version of this guard was blind
    // to it, which made the guard vacuous against the only call it polices.
    if (isCreateRequire(target)) return true;
    if (!ts.isIdentifier(target)) return false;
    return target.text === "require" || requireLike.has(target.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isResolver(node.expression)) {
      found.push({
        file,
        specifier: specifierOf(node.arguments[0], constants),
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
    .filter((call) => call.specifier === null || !ALLOWED.has(call.specifier))
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

  it("allows the manifest, which the exports map declares", () => {
    // ADR 0009 §3. Widened by exactly one specifier, and only because resolving
    // the package root throws under CommonJS.
    const dir = planted(
      `export const p = require.resolve("@perchjs/ui/manifest.json");\n`,
    );
    expect(offences(dir)).toEqual([]);
  });

  it("rejects a subpath the exports map does not declare", () => {
    // The renderer's internal layout is its own business; pinning it here is how
    // a "just this once" turns into a contract nobody wrote down.
    const dir = planted(
      `export const p = require.resolve("@perchjs/ui/dist/index.js");\n`,
    );
    expect(offences(dir)).toHaveLength(1);
  });

  it("sees a resolver called straight off createRequire", () => {
    // The form the production code uses, and the one the first version of this
    // guard was blind to — which made it vacuous against the only call it
    // exists to police.
    const dir = planted(
      `import { createRequire } from "node:module";\n` +
        `export const p = createRequire(import.meta.url).resolve("@perchjs/prisma");\n`,
    );
    expect(offences(dir)).toHaveLength(1);
  });

  it("reads through a constant naming the specifier", () => {
    // Naming it is documentation, not concealment. Refusing it would push the
    // code to inline strings, which is worse to read and no safer.
    const named = planted(
      `import { createRequire } from "node:module";\n` +
        `const UI = "@perchjs/ui";\n` +
        `export const p = createRequire(import.meta.url).resolve(UI);\n`,
    );
    expect(offences(named)).toEqual([]);

    const other = planted(
      `import { createRequire } from "node:module";\n` +
        `const OTHER = "@perchjs/prisma";\n` +
        `export const p = createRequire(import.meta.url).resolve(OTHER);\n`,
    );
    expect(offences(other)).toHaveLength(1);
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
