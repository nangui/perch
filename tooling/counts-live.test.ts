/**
 * A number written in prose still says what the tree says.
 *
 * The front page, the contributing guide and the changeset notes each count
 * something out loud: how many packages ship together, how many decisions have
 * been recorded. A count is the one kind of claim that goes wrong on its own,
 * without anybody editing the sentence — the seventh package is added and six
 * sentences elsewhere quietly become false.
 *
 * Enforced rather than remembered: the package count drifted twice, from five
 * to six to seven, and was corrected in six places at once only when adding a
 * changeset happened to put the release machinery in front of somebody. The
 * decision count was out by seven records.
 *
 * Only the counts that earn their place are here. The others were rewritten to
 * say `every` and cannot rot; this guards the ones a reader is genuinely better
 * off knowing, and the cost of keeping them is that something has to check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

/** What actually ships: a package under `packages/` that is not `private`. */
function publishable(): string[] {
  return readdirSync(join(ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json"))
    .map((path) => JSON.parse(read(path)) as { name: string; private?: boolean })
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => manifest.name)
    .sort();
}

/** Every decision record. `README.md` is the index, not a record. */
function decisions(): string[] {
  return readdirSync(join(ROOT, "docs/adr"))
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
}

const UNITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/**
 * How the number reads, so a sentence may spell it or print it.
 *
 * The two files stating the decision count do not agree on which, and neither
 * is wrong: a numbered list reads better with digits and a sentence with
 * words. Accepting both is cheaper than making every page write it one way.
 */
function spelt(count: number): string[] {
  const digits = String(count);
  if (count < 20) return [digits, UNITS[count] ?? digits];
  const ten = TENS[Math.floor(count / 10)] ?? "";
  const unit = count % 10;
  if (ten === "") return [digits];
  return [digits, unit === 0 ? ten : `${ten}-${UNITS[unit] ?? ""}`];
}

interface Claim {
  /** The file making it, for the message. */
  readonly page: string;
  /** What it is counting, for the message. */
  readonly counts: string;
  /** Catches the number the sentence states, in group 1. */
  readonly sentence: RegExp;
  /** What the tree says it is. */
  readonly truth: () => number;
}

const CLAIMS: readonly Claim[] = [
  {
    page: "README.md",
    counts: "packages that ship",
    sentence: /v0\.2 in progress — ([a-z0-9-]+) packages building/,
    truth: () => publishable().length,
  },
  {
    page: "README.md",
    counts: "decision records",
    sentence: /([a-z0-9-]+) records in \[`docs\/adr\/`\]/,
    truth: () => decisions().length,
  },
  {
    page: "CONTRIBUTING.md",
    counts: "decision records",
    sentence: /— ([a-z0-9-]+) records, every one accepted\./,
    truth: () => decisions().length,
  },
];

describe("a count written in prose", () => {
  it.each(CLAIMS)("matches the tree in $page, counting $counts", (claim) => {
    const found = claim.sentence.exec(read(claim.page));

    // A reworded sentence fails here rather than going unchecked, which is the
    // point: a claim nothing can find is a claim nothing is holding.
    expect(
      found,
      `${claim.page} no longer states how many ${claim.counts} there are, ` +
        `or says it differently. Expected to match ${String(claim.sentence)}.`,
    ).not.toBeNull();

    const truth = claim.truth();
    expect(
      spelt(truth),
      `${claim.page} says ${String(found?.[1])} ${claim.counts}; there are ${String(truth)}.`,
    ).toContain(found?.[1]);
  });
});

describe("what the counts are read from", () => {
  it("finds the packages by their manifests, not by a list written here", () => {
    // Otherwise the guard needs the same edit as the prose it is guarding, and
    // guards what somebody remembered rather than what is there.
    expect(publishable()).toContain("@perchjs/core");
    expect(publishable()).not.toContain("@perchjs/tooling");
  });

  it("counts every decision and treats the index as one of none", () => {
    expect(decisions().length).toBeGreaterThan(0);
    expect(decisions()).not.toContain("README.md");
  });

  it("reads a number the way either kind of sentence writes it", () => {
    expect(spelt(7)).toEqual(["7", "seven"]);
    expect(spelt(30)).toEqual(["30", "thirty"]);
    expect(spelt(42)).toEqual(["42", "forty-two"]);
  });
});
