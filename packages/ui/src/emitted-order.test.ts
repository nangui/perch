/**
 * Where the engine puts a conditional rule, measured rather than assumed.
 *
 * A table that stacks on a phone undoes the table's own rules at the same
 * specificity, so order alone decides. The config no longer controls it: the
 * engine does, and a release that reordered them would take the narrow layout
 * apart with nothing failing, every rule still present and still saying what it
 * says. Two orders matter — conditions after plain rules, and the rules inside
 * one condition as written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SHEET = readFileSync(resolve("packages/ui/src/panda.css"), "utf8");

/** The rules of one layer, at its top level, in the order they are written. */
function topLevel(
  layer: string,
): readonly { readonly head: string; readonly line: number }[] {
  const opened = SHEET.indexOf(`@layer ${layer} {`);
  expect(opened, `the sheet declares no @layer ${layer}`).toBeGreaterThan(-1);

  const out: { head: string; line: number }[] = [];
  let depth = 0;
  let head = "";
  let line = SHEET.slice(0, opened).split("\n").length;
  for (let at = SHEET.indexOf("{", opened) + 1; at < SHEET.length; at += 1) {
    const character = SHEET[at] ?? "";
    if (character === "\n") line += 1;
    if (character === "{") {
      if (depth === 0) out.push({ head: head.trim().replace(/\s+/g, " "), line });
      depth += 1;
      head = "";
      continue;
    }
    if (character === "}") {
      if (depth === 0) break;
      depth -= 1;
      head = "";
      continue;
    }
    if (depth === 0) head += character;
  }
  return out;
}

describe("the generated sheet", () => {
  it("writes every plain rule before any conditional one, in each layer", () => {
    for (const layer of ["base", "recipes.slots"]) {
      const rules = topLevel(layer);
      expect(rules.length, `@layer ${layer} came back empty`).toBeGreaterThan(0);

      const first = rules.findIndex((rule) => rule.head.startsWith("@"));
      if (first === -1) continue;
      const late = rules.slice(first).filter((rule) => !rule.head.startsWith("@"));
      expect(
        late.map((rule) => `${layer}:${String(rule.line)} ${rule.head}`),
        "a plain rule is written after a condition, so a conditional rule that " +
          "undoes it at equal specificity no longer wins",
      ).toEqual([]);
    }
  });

  it("keeps the rules inside one condition in the order they were written", () => {
    const narrow = topLevel("base").find(
      (rule) => rule.head === "@media (max-width: 40rem)",
    );
    expect(narrow, "no rule stacks the panel at 40rem").toBeDefined();

    const opened = SHEET.indexOf(
      "{",
      SHEET.indexOf(narrow?.head ?? "@media (max-width: 40rem)"),
    );
    let depth = 1;
    let at = opened + 1;
    while (at < SHEET.length && depth > 0) {
      if (SHEET[at] === "{") depth += 1;
      else if (SHEET[at] === "}") depth -= 1;
      at += 1;
    }
    const block = SHEET.slice(opened + 1, at - 1);

    // Both are `.perch-table__cell` at one class, so the second has to come
    // second.
    const stacks = block.indexOf(".perch-table, .perch-table tbody");
    const lays = block.indexOf("\n    .perch-table__cell {");
    expect(stacks, "nothing turns the table into a stack").toBeGreaterThan(-1);
    expect(lays, "nothing lays a stacked cell out as a row").toBeGreaterThan(-1);
    expect(
      lays,
      "the cell is laid out before the table is stacked, so `display: block` " +
        "lands on it last and the heading and the value stop sitting side by side",
    ).toBeGreaterThan(stacks);
  });
});
