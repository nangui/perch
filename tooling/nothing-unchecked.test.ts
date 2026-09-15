/**
 * No TypeScript file in this repository is outside every project.
 *
 * A file no `tsconfig.json` claims is checked by nothing. `tsc` never sees it,
 * and ESLint refuses it outright, which reads as an error about the parser
 * rather than as a gap in coverage. Vitest still runs it, because esbuild
 * erases types instead of checking them, so the file behaves exactly like one
 * that is covered right up until it is wrong.
 *
 * Enforced rather than remembered: three separate corners of this repository
 * were outside every project at once. Sixteen files of cross-package proofs,
 * the documentation site's configuration, and the vitest configuration that
 * every suite is run through. Each was found by hand, one commit apart, and
 * the third only because the second made somebody look.
 *
 * TypeScript only. A JavaScript configuration file is allowed to live outside
 * a project, and one does: the release script is plain Node ESM, linted with
 * the type-aware rules turned off because there is nothing for them to read.
 *
 * What counts as a file of this repository is what git tracks, not what is on
 * the disk. Two suites write TypeScript into `packages/*` while they run, and
 * a walk that saw one of those would fail for a file that is not part of
 * anything and will be gone a moment later. A test that cries wolf teaches
 * people to run it again.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every file this repository holds, as git has it: what is committed and what
 * has been added since, minus everything ignored.
 *
 * Ignored is what makes this work rather than merely convenient. The generated
 * trees are ignored, so they never reach the rule below without being named
 * here. So are the fixtures the boundary suite writes into `packages/*` while
 * it runs, which is why this can be asked during a full run at all. And
 * counting what is uncommitted means a file is covered from the moment it is
 * written, not from the moment somebody commits it.
 */
function tracked(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split("\0")
    .filter((line) => line !== "");

  // Loudly, rather than passing by finding nothing: an empty answer means git
  // is not there or this is not a checkout, and the rule would be vacuous.
  if (listed.length === 0) {
    throw new Error("git ls-files returned nothing; this must run in a checkout.");
  }
  return listed;
}

/** Config files, which is the one thing that is looked for on disk. */
function walk(directory: string, take: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(path, take));
    else if (take(entry.name)) out.push(relative(ROOT, path));
  }
  return out;
}

/**
 * Every project, named by its own config.
 *
 * `tsconfig.build.json` is left out: it is the same sources with emit turned
 * on, so it can only repeat what the project beside it already claimed.
 */
function projects(): string[] {
  return walk(ROOT, (name) => /^tsconfig(\.root)?\.json$/.test(name)).sort();
}

/** What a project holds, asked of the compiler rather than read off a glob. */
function claimedBy(project: string): string[] {
  const listed = execFileSync(
    join(ROOT, "node_modules", ".bin", "tsc"),
    ["-p", project, "--listFilesOnly"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return listed
    .split("\n")
    .filter((line) => line !== "" && !line.includes(`${sep}node_modules${sep}`))
    .map((line) => relative(ROOT, line.trim()));
}

describe("every TypeScript file belongs to a project", () => {
  it("leaves none of them unclaimed", () => {
    const claimed = new Set(projects().flatMap(claimedBy));
    const written = tracked().filter((path) => /\.(ts|tsx|mts|cts)$/.test(path));
    const orphans = written.filter((path) => !claimed.has(path)).sort();

    expect(
      orphans,
      "Outside every tsconfig, so checked by nothing:\n" +
        `${orphans.join("\n")}\n\n` +
        "Add the file to the project that should hold it, or give its package " +
        "a tsconfig.json of its own.",
    ).toEqual([]);
  });

  it("read enough of the tree to mean anything", () => {
    // A walk that silently returned nothing would make the rule above pass by
    // finding no files rather than by finding them covered.
    const written = tracked().filter((path) => /\.(ts|tsx|mts|cts)$/.test(path));

    expect(written.length).toBeGreaterThan(200);
    expect(written).toContain("tooling/nothing-unchecked.test.ts");
    expect(written).toContain("vitest.config.ts");
  });
});

describe("every workspace package", () => {
  it("declares how it is typechecked and linted", () => {
    // The shape the gap took twice: a package with no scripts is counted as
    // successful by turbo without anything having run.
    const manifests = [
      "docs",
      "tooling",
      ...readdirSync(join(ROOT, "packages")).map((name) => join("packages", name)),
      ...readdirSync(join(ROOT, "examples")).map((name) => join("examples", name)),
    ];
    const missing = manifests.filter((where) => {
      const manifest = JSON.parse(
        readFileSync(join(ROOT, where, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      const scripts = manifest.scripts ?? {};
      return scripts["typecheck"] === undefined || scripts["lint"] === undefined;
    });

    expect(missing, `No typecheck or lint script: ${missing.join(", ")}`).toEqual([]);
  });
});
