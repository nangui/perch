/**
 * Nothing is imported that git does not carry at all.
 *
 * `generated-inputs.test.ts` asks the neighbouring question and cannot answer
 * this one. It asks git which of these paths it *refuses* to carry, so it sees
 * generated code and nothing else: a file nobody ever added is not ignored, and
 * `check-ignore` says nothing about it.
 *
 * That gap shipped. A controller was written, imported by the module and
 * exported from the package index, and never added — the import and the export
 * went out in an unrelated commit while the file stayed on one disk. Every gate
 * was green there, because the file was sitting beside them. `@perchjs/nest`
 * did not compile from a clean checkout: three `TS2307` on two files.
 *
 * So this reads the import graph of what git carries and asks whether each
 * target is carried too. A target git ignores is somebody else's rule; a target
 * git has simply never heard of is this one.
 *
 * The graph comes from the compiler's own scanner rather than from a pattern
 * over the text. A pattern reported five imports that are not imports: the
 * module the CLI writes into somebody else's project, and fixtures a test
 * asserts the shape of. Both are source code inside a string, and only a parser
 * can tell the difference.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const tracked = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "")
    // A path git carries whose file is gone: somebody is mid-deletion, and
    // reading it throws rather than reporting anything about an import.
    .filter((path) => existsSync(join(ROOT, path)));

/** Which of these paths git refuses to carry — those answer to the other rule. */
function ignoredAmong(paths: readonly string[]): ReadonlySet<string> {
  if (paths.length === 0) return new Set();
  const answer = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: ROOT,
    encoding: "utf8",
    input: paths.join("\n"),
  });
  return new Set(answer.stdout.split("\n").filter((line) => line !== ""));
}

/**
 * What a specifier points at, the way the bundler and `tsc` read it.
 *
 * A `.js` specifier naming a `.ts` file is the convention here, so the
 * extension is tried both ways, and a directory is tried for its index.
 */
function candidatesFor(from: string, specifier: string): readonly string[] {
  const base = resolve(ROOT, dirname(from), specifier);
  const bare = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  return [
    base,
    `${bare}.ts`,
    `${bare}.tsx`,
    `${bare}.d.ts`,
    join(bare, "index.ts"),
    join(bare, "index.tsx"),
  ];
}

interface Offence {
  readonly file: string;
  readonly specifier: string;
  readonly looked: readonly string[];
}

/** The relative specifiers one file imports, as the compiler reads them. */
function importsOf(file: string): readonly string[] {
  const text = readFileSync(join(ROOT, file), "utf8");
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map((one) => one.fileName)
    .filter((one) => one.startsWith("."));
}

/** Every relative import, in a tracked file, of something git has never heard of. */
function unknownTargets(): readonly Offence[] {
  const carried = new Set(tracked());
  const out: Offence[] = [];

  for (const file of tracked()) {
    if (!/\.(ts|tsx|mts|cts)$/.test(file)) continue;
    for (const specifier of importsOf(file)) {
      const looked = candidatesFor(file, specifier).map((one) => relative(ROOT, one));
      if (looked.some((one) => carried.has(one))) continue;
      out.push({ file, specifier, looked });
    }
  }

  // A target git ignores is generated, and whether its package can produce it
  // is the other rule's question rather than this one's.
  const refused = ignoredAmong(out.flatMap((one) => one.looked));
  return out.filter((one) => !one.looked.some((path) => refused.has(path)));
}

describe("a file git carries", () => {
  it("imports nothing git has never heard of", () => {
    expect(
      [
        ...new Set(unknownTargets().map((one) => `${one.file} -> ${one.specifier}`)),
      ].sort(),
      "the target is neither carried by git nor ignored by it, so the package " +
        "compiles here and nowhere else — the file was probably never added",
    ).toEqual([]);
  });

  it("was reading an import graph and not an empty one", () => {
    // Otherwise the rule above passes by finding no imports to check.
    const relatives = tracked()
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .reduce((count, file) => count + importsOf(file).length, 0);
    expect(relatives).toBeGreaterThan(500);
  });

  it("is checked against a list git actually answered", () => {
    expect(tracked().length).toBeGreaterThan(200);
    expect(existsSync(join(ROOT, "package.json"))).toBe(true);
  });
});
