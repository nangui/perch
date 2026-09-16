/**
 * The guide holds no em dash.
 *
 * A house rule, and one nobody keeps by intending to. It is the punctuation an
 * author reaches for without deciding to: it joins two clauses that a colon, a
 * full stop or a comma would join better, and it reads as a writer thinking
 * aloud rather than as a page somebody will follow while their build is
 * broken. Forty-seven pages keep it and it took writing eleven more to break
 * it nine times in one sitting.
 *
 * The guide only. Every decision record and every page above `guide/` uses em
 * dashes freely, and those are written for whoever is building the framework
 * rather than for whoever is using it. The line is between the two audiences,
 * not between good and bad punctuation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUIDE = join(ROOT, "docs", "guide");

function pages(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...pages(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

describe("the guide", () => {
  it("says it with a colon, a comma or a full stop", () => {
    const found = pages(GUIDE).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          line.includes("—") ? [`${relative(ROOT, path)}:${String(index + 1)}`] : [],
        ),
    );

    expect(
      found,
      "an em dash in the guide: rewrite the sentence rather than swapping the " +
        "character, since what it joins is usually two sentences",
    ).toEqual([]);
  });

  it("was read at all", () => {
    // Otherwise the rule above passes by finding no pages rather than by
    // finding them clean.
    expect(pages(GUIDE).length).toBeGreaterThan(40);
  });
});
