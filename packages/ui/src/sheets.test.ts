/**
 * Two stylesheets, while the migration runs, and the one hazard that creates.
 *
 * The generated sheet puts its rules in cascade layers. This one puts them in
 * no layer at all, and unlayered styles beat every layer — not by specificity,
 * not by order, but by the cascade itself. Measured on the served sheet: the
 * recipes sit inside `@layer recipes.slots` and the hand-written rules begin
 * after the last layer closes.
 *
 * So a surface converted without deleting the rules it replaced looks
 * converted. The recipe is in the sheet, the markup carries its classes, and
 * every declaration renders from the old rule instead. Nothing fails, nothing
 * warns, and the only sign is that the change had no effect.
 *
 * This is what makes that mechanical rather than a thing to remember while
 * moving five thousand lines a surface at a time.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

/**
 * The classes a sheet draws, from its selectors.
 *
 * Read off the whole file rather than off rule preludes, because a grouped
 * selector and a nested one are both places a class is styled, and a reader
 * overriding one does not care which.
 */
function drawn(css: string): ReadonlySet<string> {
  return new Set(
    [...css.matchAll(/\.(perch-[a-z0-9_-]+)/g)].map((found) => found[1] ?? ""),
  );
}

describe("the sheet still written by hand", () => {
  it("draws nothing a recipe already draws", () => {
    const generated = drawn(read("panda.css"));
    const byHand = drawn(read("styles.css"));
    const both = [...byHand].filter((one) => generated.has(one)).sort();

    expect(
      both,
      `${both.join(", ")} — the recipe is in a layer and this is not, so these ` +
        `render from the hand-written rule and the conversion did nothing`,
    ).toEqual([]);
  });

  it("was comparing something, so it cannot pass by reading nothing", () => {
    // Both halves have to be non-empty. A path that stopped resolving would
    // otherwise make the rule above vacuous on the day it matters most.
    expect(drawn(read("panda.css")).size).toBeGreaterThan(0);
    expect(drawn(read("styles.css")).size).toBeGreaterThan(50);
  });
});
