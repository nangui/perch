/**
 * What the stylesheet promises a narrow window.
 *
 * Read from the source, because jsdom computes no layout: a rendered form
 * measures zero there and would vouch for any rule at all. The same approach
 * `modal-styles.test.ts` takes, and for the same reason.
 *
 * A `columns(3)` honoured on a phone is three fields of eleven characters and a
 * date picker that cannot show a date. Below the width two fields are worth
 * reading side by side, the declaration stops being an instruction, and the
 * layout has to say so — a grid that keeps its columns there is a form nobody
 * can fill in.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Both sheets, the generated one first, as the panel serves them.
const STYLES = [
  readFileSync(new URL("./panda.css", import.meta.url), "utf8"),
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
].join("\n");

/** The body of the at-rule opening with this condition, counting from `from`. */
function blockOf(condition: string, from = 0): string {
  const at = STYLES.indexOf(`@media ${condition}`, from);
  expect(at, `no rule for ${condition}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let cursor = STYLES.indexOf("{", at); cursor < STYLES.length; cursor += 1) {
    if (STYLES[cursor] === "{") depth += 1;
    if (STYLES[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return STYLES.slice(at, cursor + 1);
    }
  }
  return "";
}

/**
 * The block at this width that names this selector, wherever it sits.
 *
 * Found by what it holds rather than by being the first or the second. There
 * are several blocks at this width now — the dashboard's grid collapses here
 * too — so counting them picks whichever surface happens to be written first.
 * Position still matters for the shell, and the test below holds it directly
 * instead of leaving it implied by a lookup.
 */
function narrowBlockNaming(selector: string): string {
  const condition = "(max-width: 40rem)";
  for (let from = 0; ;) {
    const at = STYLES.indexOf(`@media ${condition}`, from);
    if (at === -1) break;
    const block = blockOf(condition, at);
    if (block.includes(selector)) return block;
    from = at + block.length;
  }
  expect.fail(`no block at ${condition} names ${selector}`);
}

describe("a form in a narrow window", () => {
  const narrow = (): string => narrowBlockNaming(".perch-layout__body");

  it("stacks what a declaration asked to put side by side", () => {
    expect(narrow()).toContain(".perch-layout__body");
    expect(narrow()).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("closes the gap the columns had needed", () => {
    // The space that separated two columns reads as a space between unrelated
    // things once everything is one column.
    // Either spelling of the step: a hand-written rule names the property a
    // theme overrides, a generated one reaches it through the alias the styling
    // engine names after its category.
    expect(narrow()).toMatch(/gap:\s*var\(--perch-(?:space|spacing)-\d\)/);
  });

  it("is keyed to the width and not to the device", () => {
    // A narrow window on a desktop has the same problem, and a rule keyed to a
    // touch screen would miss it.
    expect(narrow()).not.toContain("pointer:");
    expect(narrow()).not.toContain("hover:");
  });
});

/**
 * The navigation, which is what actually made the difference.
 *
 * It holds a fixed fifteen rems. Measured at 390px before this: the page had
 * 374, the form's own area 134, and a field 22 — the grid above was collapsing
 * into a space that was already too small.
 */
describe("the shell in a narrow window", () => {
  // After the rules it undoes, because at equal specificity the last one wins.
  // Placed beside the grid's rules it lost to `display: flex` and measured as
  // no change at all. Which block that is no longer depends on where anybody
  // wrote it: both halves are generated, so it is found by what it names.
  const shell = (): string => narrowBlockNaming(".perch-shell");

  it("stacks the navigation above the page rather than beside it", () => {
    expect(shell()).toContain(".perch-shell");
    expect(shell()).toContain("display: block");
  });

  it("lets the navigation take the width instead of a fixed column", () => {
    expect(shell()).toContain("width: auto");
  });

  it("comes after the rule it has to undo, or it does nothing at all", () => {
    // The bug this file exists to keep out: the rule was right, unreachable,
    // and silent about it.
    //
    // Still the right thing to measure — the order in the sheet the panel
    // serves — but no longer for the reason it was written. Both halves are
    // generated now, so where the block lands is the engine's decision rather
    // than a file somebody keeps in order, and `emitted-order.test.ts` is
    // what reads that decision off the sheet. This stays because it is about
    // this layout and names the fault.
    const flex = STYLES.indexOf(".perch-shell {");
    const block = STYLES.indexOf("@media (max-width: 40rem)", flex);

    expect(flex).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(flex);
  });
});

describe("a column that says how much room it takes", () => {
  it("is aligned by a logical property, so it holds right to left", () => {
    // `text-align: right` pins a column of numbers to the wrong end of the row
    // for a reader in Arabic or Hebrew. `end` is the edge the line finishes
    // at, whichever side that is.
    expect(STYLES).toContain("text-align: end");
    expect(STYLES).not.toMatch(/\.perch-table__cell--end\s*\{\s*text-align:\s*right/);
  });

  it("is dropped only below the width where a row stops being a row", () => {
    // The same breakpoint the rest of this file is about. A column hidden at
    // one width and a layout that stacks at another is two answers to one
    // question, and a reader meets whichever is worse.
    const at = STYLES.indexOf("perch-table__cell--wide-only");
    expect(at).toBeGreaterThan(-1);
    expect(STYLES.slice(STYLES.lastIndexOf("@media", at), at)).toContain(
      "(max-width: 40rem)",
    );
  });
});
