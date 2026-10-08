/**
 * The published stylesheet is a door, and holds nothing of its own.
 *
 * `@perchjs/ui/styles.css` is the entry the exports map advertises, so it has
 * to keep existing and keep importing the generated sheet. What it must not do
 * again is carry a rule: while it did, its rules sat in no cascade layer and so
 * outranked every recipe whatever the recipe carried — a surface converted
 * without deleting the rules it replaced looked converted and rendered from the
 * old ones.
 *
 * That hazard is what `layer-flip.test.ts` was for, shape by shape. It is
 * answered more simply now: one hand-written rule is one too many, and this
 * says so without needing to know which element it would have met.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

/**
 * Every rule's selector list, comments and at-statements gone.
 *
 * The `@import` sits before the first rule and lands in its selector unless it
 * is taken out — which is the same slip four other readers of this sheet made
 * before this one, three of them silently.
 */
function selectors(css: string): readonly string[] {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(?:import|charset)[^;]*;/g, "");
  return [...clean.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((found) => (found[1] ?? "").trim().replace(/\s+/g, " "))
    .filter((one) => one !== "");
}

describe("the published stylesheet", () => {
  it("pulls in the generated one, which is the only thing that serves it", () => {
    // It has been deleted twice by a tool cutting a moved rule out, taking the
    // file header it sat under with it, and nothing failed either time — a
    // panel with no styles at all passed.
    expect(read("styles.css")).toContain('@import "./panda.css";');
  });

  it("declares no rule of its own", () => {
    expect(
      selectors(read("styles.css")),
      "a rule here sits in no cascade layer and outranks every recipe, " +
        "whatever the recipe carries — the design belongs in `panda.config.ts`",
    ).toEqual([]);
  });

  it("was reading the generated sheet, which is where the rules are", () => {
    // So the rule above cannot pass by reading an empty file while the panel
    // ships no styles at all.
    expect(selectors(read("panda.css")).length).toBeGreaterThan(100);
  });
});
