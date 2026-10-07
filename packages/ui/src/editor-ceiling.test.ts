/**
 * Both writing surfaces stop growing, and why that is not a preference.
 *
 * A textarea and a contenteditable both grow with what is typed into them, and
 * the page grows under them. The toolbar is at the top of each, so a long note
 * is written with its buttons somewhere above the screen — and the frame around
 * the rich editor clips rather than scrolls, which put anything past the fold
 * out of reach entirely.
 *
 * Both carry a ceiling and their own scrollbar for that reason, and both say so
 * at length in a comment. Neither was asserted anywhere: probed by deleting the
 * rich editor's, and the whole suite stayed green.
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

const SURFACES = [
  ["the markdown editor's box", ".perch-markdown__box"],
  ["the rich editor's page", ".perch-rich__page"],
] as const;

describe("a surface somebody writes into", () => {
  it.each(SURFACES)("%s has a ceiling", (_what, selector) => {
    const rule = ruleFor(selector);

    expect(rule, `no rule for ${selector}`).toBeDefined();
    expect(rule, `${selector} grows without a ceiling`).toMatch(/max-height:/);
  });

  it.each(SURFACES)("%s scrolls rather than clipping", (_what, selector) => {
    // A ceiling on its own hides the overflow instead of reaching it, which is
    // the fault this replaced rather than a smaller version of it.
    const rule = ruleFor(selector);

    expect(rule, `${selector} caps its height and cannot be scrolled`).toMatch(
      /overflow(-y)?: auto|resize: vertical/,
    );
  });
});
