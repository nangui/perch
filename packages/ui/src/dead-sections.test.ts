/**
 * No heading in the hand-written sheet stands over nothing.
 *
 * The sheet is divided into named sections, and the migration empties them one
 * at a time: the rules go into the styling config and the heading stays, over
 * nothing, reading as though that surface were still written by hand. Three
 * were standing that way — `control` and `renderer` over no rule at all, and
 * `icon` over five surfaces that are not icons, its own rules having left
 * several releases earlier.
 *
 * Worse than untidy, because of what went with them. The reasoning for the
 * focus-ring floor and the icon box was written under those headings and was
 * never carried to the config when the rules were, so for several releases the
 * rules were in one file and the reasons in another that no longer held them.
 * A heading nobody checks is where that hides.
 *
 * This asks only the measurable half: that each heading has rules under it.
 * Whether the name still fits what it heads is not something a test can read.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LINES = readFileSync(new URL("./styles.css", import.meta.url), "utf8").split(
  "\n",
);

/** A section heading: a comment of nothing but dashes and a name. */
const HEADING = /^\/\* -{5,}\s*(.+?)\s*\*\/$/;

interface Section {
  readonly name: string;
  readonly line: number;
  readonly rules: number;
}

function sections(): readonly Section[] {
  const found: { name: string; line: number; rules: number }[] = [];
  for (const [at, line] of LINES.entries()) {
    const heading = HEADING.exec(line.trim());
    if (heading !== null) {
      found.push({ name: heading[1] ?? "", line: at + 1, rules: 0 });
      continue;
    }
    // A rule opens with a brace at the end of its selector. Good enough on a
    // sheet this file also holds to Prettier's formatting.
    if (/\{\s*$/.test(line) && found.length > 0) {
      const last = found[found.length - 1];
      if (last !== undefined) last.rules += 1;
    }
  }
  return found;
}

describe("the sheet still written by hand", () => {
  it("has no section heading with nothing under it", () => {
    const empty = sections()
      .filter((one) => one.rules === 0)
      .map((one) => `${one.name} (line ${String(one.line)})`);

    expect(
      empty,
      "the rules under this heading have moved and the heading stayed — check " +
        "whether anything written under it moved with them",
    ).toEqual([]);
  });

  it("was reading headings and found them", () => {
    // Otherwise the rule above passes by finding no sections at all, which is
    // how it will end: the last one goes when the sheet does.
    expect(sections().length).toBeGreaterThan(5);
  });
});
