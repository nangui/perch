/**
 * No comment points at a document by its number.
 *
 * `(ADR 0016)` tells a reader that a decision was written down, not what it
 * was. They then have to find the file, find the section, and read past what
 * changed since — or, more often, they do not, and the comment has cost a line
 * to say nothing. The reason belongs where the code is.
 *
 * Enforced rather than remembered: this rule was given, agreed, and broken
 * forty-five times across six packages before anything checked it.
 *
 * Whole lines, not only comments. A citation in an error message points a
 * reader at a document exactly as one in a comment does, and the bundle budget
 * had one in the text it fails with.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Where source lives. `docs/` is where these references belong. */
const ROOTS = ["packages", "examples", "tooling"];

/** Build output. Everything dotted — `.tsbuild`, `.generated` — goes below. */
const SKIP = new Set(["node_modules", "dist"]);

/**
 * A number is what makes it a pointer. `an architecture decision` is prose;
 * `ADR 0007 §5` is a citation, and citations are what this refuses.
 */
const CITATIONS: readonly RegExp[] = [
  /\bADRs?\b/,
  /\bPRD\b/,
  /\bARCH\s*\d/,
  /\binvariant\s+\d/i,
  /\bCLAUDE\.md\b/,
];

function sources(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Files that guard a document, and so cannot avoid naming one.
 *
 * This file has always exempted itself, for the same reason: the patterns it
 * refuses are written in it. The exemption is that principle said out loud
 * rather than a second one. Keep it to files whose subject is the document —
 * a guard that reads a page and checks it against the tree is not pointing a
 * reader somewhere else, it is holding the page to what is there.
 */
const ABOUT_A_DOCUMENT = new Set(["tooling/counts-live.test.ts"]);

/** `file:line` for every citation, so a failure says where to go. */
function citations(): string[] {
  const here = fileURLToPath(import.meta.url);
  const found: string[] = [];

  for (const root of ROOTS) {
    for (const file of sources(join(ROOT, root))) {
      if (file === here || ABOUT_A_DOCUMENT.has(relative(ROOT, file))) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (CITATIONS.some((pattern) => pattern.test(line))) {
          found.push(`${relative(ROOT, file)}:${String(index + 1)}`);
        }
      });
    }
  }
  return found;
}

describe("comments", () => {
  it("say the reason rather than name the document", () => {
    expect(
      citations(),
      "a comment cites a document by number: replace the citation with what it " +
        "decided, which is what the next reader of this line actually needs",
    ).toEqual([]);
  });
});
