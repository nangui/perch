/**
 * No heading in the hand-written sheet stands over nothing.
 *
 * The migration empties the sections one at a time and the headings stay, over
 * nothing, reading as though the surface were still written by hand. Three
 * were — and what hid under them matters more than the untidiness: the
 * reasoning for the focus-ring floor and the icon box was written there and
 * never carried to the config when the rules were.
 *
 * Only the measurable half is asked. Whether a name still fits what it heads
 * is not something a test can read.
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
    // Otherwise the rule above passes by finding no sections at all. Not a
    // count: there were twelve, there are five, and the last goes when the
    // sheet does — a floor above one would have to be lowered at each move,
    // which is a number nobody maintains rather than a thing being checked.
    const found = sections();
    expect(found.length).toBeGreaterThan(0);
    // And that the parse is seeing rules, so a selector pattern that stopped
    // matching reads as every section being empty rather than as nothing.
    expect(found.reduce((n, one) => n + one.rules, 0)).toBeGreaterThan(0);
  });
});
