/**
 * Every TypeScript example in the documentation compiles.
 *
 * Written before the documentation it guards, and for the reason every other
 * guard here was: an example is the first thing a reader copies and the last
 * thing anybody remembers to update. A renamed method leaves the page looking
 * exactly as right as it did the day it was written.
 *
 * Each block is compiled as a module of its own, with the cast of characters
 * in `docs/cast.ts` in scope — so an example may say `panel.resource(UserResource)`
 * without building a resource first, while every call, argument and return
 * type is still checked against what the packages publish.
 *
 * A block that cannot be a module says so with `no-check` on its fence, and
 * every one of those is named below. An allowlist that only grows is a guard
 * that stops guarding, quietly, on the day somebody is in a hurry.
 *
 * **What this is checked against is the build, not the source.** Each package
 * resolves through its `types`, which points into `dist` — the surface a reader
 * installs, and the right one to hold a page to. The cost is that a build left
 * behind checks yesterday's API and says nothing. That is not policed from in
 * here: `pnpm verify` and CI both build before they test, which is where the
 * ordering belongs. An earlier version of this file tried to catch it by
 * comparing timestamps and was intermittent, which is worse than the hazard —
 * a test that cries wolf teaches people to run it again.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Blocks excused from compiling, and why.
 *
 * Keyed by `file:block`, counting `ts` blocks from one within each file, so
 * moving a block moves its excuse with it rather than silently excusing its
 * neighbour.
 */
const NOT_COMPILED: Readonly<Record<string, string>> = {};

/** Every markdown a reader is pointed at. Design documents are not examples. */
function pages(): readonly string[] {
  const found = ["README.md", "CONTRIBUTING.md"].filter((one) =>
    existsSync(join(ROOT, one)),
  );
  for (const dir of readdirSync(join(ROOT, "packages"))) {
    const at = join("packages", dir, "README.md");
    if (existsSync(join(ROOT, at))) found.push(at);
  }
  // The guide, once it exists. Walked rather than listed: a page nobody
  // remembered to add to a list is a page nothing checks.
  const guide = join(ROOT, "docs", "guide");
  if (existsSync(guide)) {
    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const next = join(at, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith(".md")) found.push(relative(ROOT, next));
      }
    };
    walk(guide);
  }
  return found.sort();
}

interface Block {
  /** `packages/nest/README.md:2` — the file, and which `ts` block in it. */
  readonly id: string;
  readonly file: string;
  readonly code: string;
  readonly excused: boolean;
}

const FENCE = /^```(ts|tsx)([^\n]*)\n(.*?)^```/gms;

function blocks(): readonly Block[] {
  const found: Block[] = [];
  for (const file of pages()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    let at = 0;
    for (const match of text.matchAll(FENCE)) {
      at += 1;
      found.push({
        id: `${file}:${String(at)}`,
        file,
        code: match[3] ?? "",
        excused: (match[2] ?? "").includes("no-check"),
      });
    }
  }
  return found;
}

/** The names an example may lean on, imported so the compiler sees them used. */
const PRELUDE = [
  "AdminModule",
  "AppDataAdapter",
  "AuditIndicator",
  "BillingModule",
  "CityModule",
  "StarRatingRenderer",
  "IR",
  "JwtAuthGuard",
  "PrismaService",
  "PersonResource",
  "PostResource",
  "UserResource",
  "ada",
  "admin",
  "countPending",
  "hash",
  "grace",
  "guest",
  "post",
];

describe("the examples in the documentation", () => {
  it("are all compiled, or excused by name", () => {
    const excused = blocks()
      .filter((one) => one.excused)
      .map((one) => one.id);

    expect(excused.sort()).toEqual(Object.keys(NOT_COMPILED).sort());
  });

  it("compile against what the packages publish", () => {
    const wanted = blocks().filter((one) => !one.excused);
    // A documentation with no examples passes this by having nothing to say,
    // which is not the same as passing it.
    expect(wanted.length).toBeGreaterThan(0);

    const dir = mkdtempSync(join(tmpdir(), "perch-docs-"));
    mkdirSync(join(dir, "src"));
    for (const [at, block] of wanted.entries()) {
      const imported = PRELUDE.filter(
        (name) =>
          new RegExp(`\\b${name}\\b`).test(block.code) &&
          // Unless the example brings its own. A page is entitled to write
          // `const admin = …`, and handing it a second one produces an error
          // about a line the author did not write and cannot see.
          !new RegExp(
            `(?:const|let|var|class|function|interface|type|enum)\\s+${name}\\b|` +
              `import[^;]*\\b${name}\\b[^;]*from`,
          ).test(block.code),
      );
      const head =
        imported.length === 0
          ? ""
          : `import { ${imported.join(", ")} } from "${join(ROOT, "tooling/docs/cast.js")}";\n` +
            `void [${imported.join(", ")}];\n`;
      writeFileSync(
        join(dir, "src", `example-${String(at)}.ts`),
        `// ${block.id}\n${head}${block.code}`,
      );
    }

    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "es2022",
          module: "esnext",
          moduleResolution: "bundler",
          skipLibCheck: true,
          noEmit: true,
          // An example is a fragment of somebody's file: a name it declares and
          // does not use again is ordinary, and refusing it would make every
          // page longer without making any of them truer.
          noUnusedLocals: false,
          noUnusedParameters: false,
          allowImportingTsExtensions: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          types: [],
          baseUrl: ROOT,
          paths: {
            "*": [join(ROOT, "tooling/node_modules/*"), join(ROOT, "node_modules/*")],
          },
        },
        include: ["src/**/*"],
      }),
    );

    let said = "";
    try {
      execFileSync("npx", ["tsc", "--project", join(dir, "tsconfig.json")], {
        cwd: join(ROOT, "tooling"),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      said = String((error as { stdout?: string }).stdout ?? error);
    }

    // Said as the page and the block, never as a path into a temporary
    // directory: a failure has to tell somebody which example to go and fix.
    const named = said
      .split("\n")
      .map((line) => {
        const at = /example-(\d+)\.ts\((\d+),/.exec(line);
        const block = at === null ? undefined : wanted[Number(at[1])];
        return block === undefined
          ? line
          : `${block.id} — ${line.slice(line.indexOf("error "))}`;
      })
      .filter((line) => line.trim() !== "")
      .join("\n");

    expect(named).toBe("");
  });
});
