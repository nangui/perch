/**
 * Every writing surface stops growing, and why that is not a preference.
 *
 * A textarea and a contenteditable both grow with what is typed into them, and
 * the page grows under them. The toolbar is at the top of each, so a long note
 * is written with its buttons somewhere above the screen — and the frame around
 * the rich editor clips rather than scrolls, which put anything past the fold
 * out of reach entirely.
 *
 * Each carries a ceiling and its own scrollbar for that reason, and each says
 * so at length in a comment. None was asserted anywhere: probed by deleting the
 * rich editor's, and the whole suite stayed green.
 *
 * Three surfaces, not two. The field's own textarea was left out of this list
 * while the prose above already described it, and its ceiling is conditional —
 * `field-sizing` grows the box during layout and `max-height` is what stops
 * that past the fold, so the cap and the scrolling are declared on two
 * selectors rather than one. That is why each entry names both.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Both sheets, while the stylesheet is being moved a surface at a time. */
const STYLES = ["panda.css", "styles.css"]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");

/**
 * The body of a rule, wherever it is declared.
 *
 * Leading space allowed on both braces: a generated rule sits inside a cascade
 * layer and is therefore indented, where a hand-written one is not.
 */
function ruleFor(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m").exec(
    STYLES,
  )?.[1];
}

/**
 * Each surface, the selector that caps it and the selector that lets it scroll.
 *
 * The same twice where one rule does both. Naming them apart is what lets a
 * conditional ceiling be checked without gathering every rule whose selector
 * starts the same way — gathering would only ever make these easier to pass.
 */
const SURFACES = [
  ["the markdown editor's box", ".perch-markdown__box", ".perch-markdown__box"],
  ["the rich editor's page", ".perch-rich__page", ".perch-rich__page"],
  [
    "the field's textarea",
    '.perch-textarea__input[data-autosize="true"]',
    ".perch-textarea__input",
  ],
] as const;

describe("a surface somebody writes into", () => {
  it.each(SURFACES)("%s has a ceiling", (_what, selector) => {
    const rule = ruleFor(selector);

    expect(rule, `no rule for ${selector}`).toBeDefined();
    expect(rule, `${selector} grows without a ceiling`).toMatch(/max-height:/);
  });

  it.each(SURFACES)("%s scrolls rather than clipping", (_what, _caps, selector) => {
    // A ceiling on its own hides the overflow instead of reaching it, which is
    // the fault this replaced rather than a smaller version of it.
    const rule = ruleFor(selector);

    expect(rule, `${selector} caps its height and cannot be scrolled`).toMatch(
      /overflow(-y)?: auto|resize: vertical/,
    );
  });
});
