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

const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

/** The body of the first at-rule opening with this condition. */
function blockOf(condition: string): string {
  const at = STYLES.indexOf(`@media ${condition}`);
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

describe("a form in a narrow window", () => {
  const narrow = blockOf("(max-width: 40rem)");

  it("stacks what a declaration asked to put side by side", () => {
    expect(narrow).toContain(".perch-layout__body");
    expect(narrow).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("closes the gap the columns had needed", () => {
    // The space that separated two columns reads as a space between unrelated
    // things once everything is one column.
    expect(narrow).toMatch(/gap:\s*var\(--perch-space-\d\)/);
  });

  it("is keyed to the width and not to the device", () => {
    // A narrow window on a desktop has the same problem, and a rule keyed to a
    // touch screen would miss it.
    expect(narrow).not.toContain("pointer:");
    expect(narrow).not.toContain("hover:");
  });
});
