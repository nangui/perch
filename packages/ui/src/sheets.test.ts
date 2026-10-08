/**
 * Two stylesheets, while the migration runs, and the one hazard that creates.
 *
 * The generated sheet puts its rules in cascade layers. This one puts them in
 * no layer at all, and unlayered styles beat every layer — not by specificity,
 * not by order, but by the cascade itself. Measured on the served sheet: the
 * recipes and the global rules sit inside layers that close at byte 8069, and
 * the hand-written rules begin at 9796.
 *
 * So a surface converted without deleting the rules it replaced looks
 * converted. The rule is in the generated sheet, the markup carries its
 * classes, and every declaration renders from the old one instead. Nothing
 * fails, nothing warns, and the only sign is that the change had no effect.
 *
 * What this does not forbid is a rule from another surface reaching into a
 * converted one — `.perch-list__search .perch-control` sets a search box's
 * control apart, and that is a deliberate override of exactly the kind the
 * cascade is for. The distinction is whether the class is the rule's own
 * target or something it reaches through.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

/** Every rule's selector list, top level, comments gone. */
function selectors(css: string): readonly string[] {
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((found) =>
    (found[1] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .replace(/\s+/g, " ")
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean),
  );
}

/**
 * The classes a sheet styles directly.
 *
 * A compound selector only — no space, no `>`, no `~`, no `+` — because a
 * combinator means the class is reached through something else, and that is a
 * context rather than a competing declaration.
 */
function ownTargets(css: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const one of selectors(css)) {
    if (/[ >~+]/.test(one)) continue;
    for (const found of one.matchAll(/\.(perch-[a-z0-9_-]+)/g)) {
      out.add(found[1] ?? "");
    }
  }
  return out;
}

describe("the sheet still written by hand", () => {
  it("styles nothing the generated sheet already styles directly", () => {
    const generated = ownTargets(read("panda.css"));
    const byHand = ownTargets(read("styles.css"));
    const both = [...byHand].filter((one) => generated.has(one)).sort();

    expect(
      both,
      `${both.join(", ")} — the generated rule is in a layer and this one is ` +
        `not, so these render from the hand-written rule and the conversion ` +
        `did nothing`,
    ).toEqual([]);
  });

  it("was comparing something, so it cannot pass by reading nothing", () => {
    // Both halves have to be non-empty. A path that stopped resolving would
    // otherwise make the rule above vacuous on the day it matters most.
    expect(ownTargets(read("panda.css")).size).toBeGreaterThan(10);
    // No floor on the hand-written half: the migration empties it, so a number
    // here is one to lower at every move. It had 59 against a floor of 50 when
    // this was written. When it reaches nothing this file is spent, the second
    // sheet being the only reason it exists.
    expect(ownTargets(read("styles.css")).size).toBeGreaterThan(0);
  });
});
