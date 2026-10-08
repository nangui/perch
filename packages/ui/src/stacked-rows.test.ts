/**
 * A table row that is wider than the window.
 *
 * Eight columns on a phone is a table somebody scrolls sideways through,
 * reading one column at a time and losing which row they were on. Stacked, a
 * row becomes a block and each cell carries the heading the header row can no
 * longer give it — the same cells, drawn by the same functions, laid out down
 * instead of across.
 *
 * Read from the source, because jsdom computes no layout: a rendered table
 * measures zero there and would vouch for any rule at all. The same approach
 * `narrow-layout.test.ts` and `modal-styles.test.ts` take.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Both sheets, the generated one first: the table is drawn there now.
const STYLES = [
  readFileSync(new URL("./panda.css", import.meta.url), "utf8"),
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
].join("\n");
const TABLE = readFileSync(new URL("./DataTable.tsx", import.meta.url), "utf8");

/** The at-rule that stacks a table, found by what only it contains. */
function stacking(): string {
  const at = STYLES.indexOf(".perch-table__cell::before");
  expect(at, "no rule writes the heading onto a cell").toBeGreaterThan(-1);

  const opened = STYLES.lastIndexOf("@media", at);
  let depth = 0;
  for (let cursor = STYLES.indexOf("{", opened); cursor < STYLES.length; cursor += 1) {
    if (STYLES[cursor] === "{") depth += 1;
    if (STYLES[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return STYLES.slice(opened, cursor + 1);
    }
  }
  return "";
}

describe("a table in a narrow window", () => {
  // Inside the tests, not beside them: an assertion that runs while the file is
  // being collected takes the whole file down and the run reports no tests.
  const rule = (): string => stacking();

  it("lays a row down the page instead of across it", () => {
    expect(rule()).toContain("display: block");
  });

  it("writes each cell's heading onto the cell", () => {
    // The header row is gone from view, so the heading has to travel with the
    // value or a stacked row is a column of unlabelled strings.
    expect(rule()).toContain("content: attr(data-label)");
  });

  it("keeps the heading row for the readers who hear it", () => {
    // Off the page rather than `display: none`: the headings are what a screen
    // reader announces each cell by, and removing them would take that away
    // from the readers who depend on it most.
    expect(rule()).toContain("clip-path");
    expect(rule()).not.toMatch(/thead[^{]*\{[^}]*display:\s*none/);
  });

  it("says nothing beside a tick or a row's own controls", () => {
    // Neither is a value, and a label there would name a column nobody asked
    // about.
    expect(rule()).toContain(".perch-table__actions::before");
    expect(rule()).toContain("content: none");
  });

  it("is keyed to the width rather than to a touch screen", () => {
    // A narrow window on a desktop has the same problem.
    expect(rule()).toContain("max-width");
    expect(rule()).not.toContain("pointer:");
  });
});

describe("what a cell carries for it", () => {
  it("is the column's label, in the markup", () => {
    // Written once where the cell is drawn rather than in a second pass: a cell
    // is drawn by one memoised function per column type, and that stays true.
    //
    // The heading rather than the raw expression: a column with no label of its
    // own reads its path as a heading now, and a stacked cell has to carry what
    // the hidden header row would have said, not what the schema called it.
    expect(TABLE).toContain("data-label={headingOf(column)}");
  });
});
