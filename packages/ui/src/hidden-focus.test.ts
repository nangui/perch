/**
 * A control whose input is invisible draws the keyboard's mark on something
 * that is not.
 *
 * `focus-ring.test.ts` holds the floor — a `:where(…):focus-visible` rule that
 * puts the ring on anything claiming none of its own. That floor cannot reach
 * these: a switch, a radio and a tick keep a real native input for the
 * semantics and the keyboard, and take it out of sight rather than out of the
 * tab order. The floor still matches it, and a ring drawn on an element at nil
 * opacity is a ring nobody sees.
 *
 * So each of them draws on the sibling the reader is actually looking at, and
 * until now nothing said so. Measured: the dot shrunk to 4px, its focus outline
 * deleted and its checked colour removed, and all 3 604 tests passed.
 *
 * Discovered rather than listed. The invisible inputs are found by reading what
 * the sheets make invisible, so a fourth one is covered the day it is written
 * instead of the day somebody remembers this file.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STYLES = [
  readFileSync(new URL("./panda.css", import.meta.url), "utf8"),
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
]
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule, as the selector list it names and what it declares. */
function rules(): readonly (readonly [string, string])[] {
  return [...STYLES.matchAll(/(^|\n)\s*([^{}@\n][^{}]*?)\{([^{}]*)\}/g)].map(
    (rule) => [(rule[2] ?? "").trim().replace(/\s+/g, " "), rule[3] ?? ""] as const,
  );
}

/**
 * Taken out of sight. Either nil opacity or clipped to nothing — the two ways
 * this tree does it.
 *
 * `opacity: 0` and not `opacity: 0.5`: a word boundary after the nought matches
 * before a decimal point, and the first version of this read every disabled
 * state in the panel as invisible.
 */
const INVISIBLE = [/opacity:\s*0\s*(?:;|$)/, /clip-path:\s*inset\(50%\)/];

/**
 * Whether a rule body draws something a reader can see at all.
 *
 * Read as declarations rather than matched as text. The pattern this replaces
 * was `outline:\s*(?!none)`, and `\s*` backtracks to nothing, so the lookahead
 * landed on the space before `none` and passed: the guard called `outline: none`
 * a visible mark. Two of its three probes went green against a control whose
 * focus had just been deleted.
 */
function marks(body: string): boolean {
  for (const piece of body.split(";")) {
    const colon = piece.indexOf(":");
    if (colon === -1) continue;
    const property = piece.slice(0, colon).trim();
    const value = piece.slice(colon + 1).trim();
    if (property === "outline" && value !== "none" && !value.startsWith("0"))
      return true;
    if (
      property === "box-shadow" &&
      /var\(--perch-(?:shadows-)?focus-ring\)/.test(value)
    ) {
      return true;
    }
  }
  return false;
}

/** The classes a sheet takes out of sight, where a control's input is one. */
function hiddenInputs(): readonly string[] {
  const out = new Set<string>();
  for (const [named, body] of rules()) {
    if (!INVISIBLE.some((shape) => shape.test(body))) continue;
    for (const one of named.split(",").map((piece) => piece.trim())) {
      if (/^\.perch-[\w-]*input$/.test(one)) out.add(one);
    }
  }
  return [...out].sort();
}

describe("an input taken out of sight", () => {
  it("still marks where the keyboard is, on something a reader can see", () => {
    const unmarked = hiddenInputs().filter((input) => {
      const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // A sibling, because the thing a reader looks at is drawn beside the
      // input rather than inside it: an `<input>` holds no elements.
      const drawn = new RegExp(`${escaped}:focus-visible\\s*[+~]\\s*\\.perch-[\\w-]+`);
      const match = rules().find(([named]) => drawn.test(named));
      if (match === undefined) return true;
      return !marks(match[1]);
    });

    expect(
      unmarked,
      "the floor puts the ring on the input itself, which cannot be seen — so " +
        "a sibling has to carry an outline or the ring, and none does",
    ).toEqual([]);
  });

  it("was found by reading the sheets, and found some", () => {
    // Otherwise the rule above passes by discovering nothing to check. Three
    // today: the switch's choice group, the radio's, and the tick.
    expect(hiddenInputs().length).toBeGreaterThanOrEqual(3);
  });
});
