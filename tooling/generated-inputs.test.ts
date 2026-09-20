/**
 * Nothing is imported that git does not carry and nobody regenerates.
 *
 * Generated code is ignored, which is right, and a task that reads it works
 * perfectly on the machine that last generated it. On a fresh checkout it does
 * not exist, and the failure arrives wherever that task runs rather than where
 * the mistake was made.
 *
 * Enforced rather than remembered: this was shipped twice in one afternoon,
 * in two packages, and both times the local gate was green because the files
 * were sitting on the disk that had written them. Seventy-two commits went out
 * on the first of the two.
 *
 * The rule is not "do not import generated code". It is that the package doing
 * the importing must be able to produce it: a script that generates, chained
 * into the checks that read it, so a clean checkout and a machine that has
 * built before agree by construction rather than by luck.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every file git carries, which is where an import may be written. */
function tracked(): readonly string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => /\.tsx?$/.test(path));
}

/**
 * Which of these paths git refuses to carry, asked of git.
 *
 * Rather than reading `.gitignore` and matching it here, which is a second
 * implementation of a matcher that already exists and would be wrong in the
 * cases that matter: a pattern anchored to a directory, a negation, a name
 * that appears at two depths.
 */
function ignoredAmong(paths: readonly string[]): ReadonlySet<string> {
  if (paths.length === 0) return new Set();
  const answer = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: ROOT,
    encoding: "utf8",
    input: paths.join("\n"),
  });
  return new Set(answer.stdout.split("\n").filter((line) => line !== ""));
}

interface Offence {
  readonly file: string;
  readonly specifier: string;
}

/** Every relative import, in a tracked file, of something git will not carry. */
function importsOfIgnored(): readonly Offence[] {
  const candidates: Offence[] = [];
  for (const file of tracked()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const found of text.matchAll(/(?:from|import\()\s*"(\.[^"]+)"/g)) {
      candidates.push({ file, specifier: found[1] ?? "" });
    }
  }

  const resolved = candidates.map((one) =>
    relative(ROOT, resolve(ROOT, dirname(one.file), one.specifier)),
  );
  const refused = ignoredAmong(resolved);
  return candidates.filter((_, at) => refused.has(resolved[at] ?? ""));
}

/** The package a file belongs to, by walking up to the nearest manifest. */
function ownerOf(file: string): string | undefined {
  const parts = file.split("/");
  for (let depth = parts.length - 1; depth > 0; depth -= 1) {
    const at = parts.slice(0, depth).join("/");
    if (existsSync(join(ROOT, at, "package.json"))) return at;
  }
  return undefined;
}

describe("a package that imports what git does not carry", () => {
  it("can produce it, in the checks that read it", () => {
    const unable = importsOfIgnored().filter((offence) => {
      const owner = ownerOf(offence.file);
      if (owner === undefined) return true;
      const scripts =
        (
          JSON.parse(readFileSync(join(ROOT, owner, "package.json"), "utf8")) as {
            scripts?: Record<string, string>;
          }
        ).scripts ?? {};
      // Every check that could read it has to make it. One that trusts an
      // earlier task is the thing that failed: the earlier task is somewhere
      // else's to schedule.
      return !["build", "typecheck", "lint"]
        .filter((name) => scripts[name] !== undefined)
        .every((name) => (scripts[name] ?? "").includes("generate"));
    });

    expect(
      unable.map((one) => `${one.file} -> ${one.specifier}`),
      "imports generated code its package cannot generate: chain `prisma " +
        "generate` into the build, typecheck and lint that read it",
    ).toEqual([]);
  });

  it("was looking at anything at all", () => {
    // Otherwise the rule passes by finding no imports rather than by finding
    // them answered for.
    expect(importsOfIgnored().length).toBeGreaterThan(0);
  });
});
