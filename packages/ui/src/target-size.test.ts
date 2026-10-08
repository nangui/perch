/**
 * WCAG 2.2 §2.5.8 — 24 × 24 CSS px per pointer target, read from the stylesheet
 * because jsdom computes no layout and a rendered box would measure zero. Same
 * approach as `contrast.test.ts` against the generated sheet.
 *
 * Reading declarations cannot see a target squeezed by its container, so where a
 * container decides the size the container is checked instead.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOKENS = readFileSync(new URL("./panda.css", import.meta.url), "utf8");

// Both sheets. A box this file measures may be declared in either while the
// stylesheet is being moved one surface at a time.
const STYLES = [
  TOKENS,
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
].join("\n");

const MIN_TARGET = 24;

/**
 * The declared box of a selector, `var()` resolved against the tokens. `null`
 * means the dimension is set by content or by the parent, not here.
 */
function declaredBox(selectors: readonly string[]): {
  width: number | null;
  height: number | null;
} {
  let width: number | null = null;
  let height: number | null = null;
  for (const selector of selectors) {
    const block = blockFor(selector);
    width = length(block, ["width", "min-width"]) ?? width;
    height = length(block, ["height", "min-height"]) ?? height;
  }
  return { width, height };
}

function blockFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Leading space allowed on both braces: a generated rule sits inside a
  // cascade layer and is therefore indented, where a hand-written one is not.
  const found = new RegExp(`^\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m").exec(
    STYLES,
  );
  if (found?.[1] === undefined) {
    throw new Error(`No rule for ${selector} in either sheet — has it been renamed?`);
  }
  return found[1];
}

function length(block: string, properties: readonly string[]): number | null {
  for (const property of properties) {
    const found = new RegExp(`^\\s*${property}:\\s*(.+?);`, "m").exec(block);
    if (found?.[1] === undefined) continue;
    const value = resolve(found[1].trim());
    if (value !== null) return value;
  }
  return null;
}

/**
 * A length, following a token to whatever it names.
 *
 * One hop is no longer enough: the styling engine's own token reads the
 * property a theme overrides, so a rule asking for a size arrives at
 * `var(--perch-sizes-control-height-sm)`, which reads
 * `var(--perch-control-height-sm)`, which is the pixels. Followed rather than
 * assumed, with a floor so a token naming itself stops rather than spins.
 */
function resolve(value: string, hops = 0): number | null {
  const direct = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (direct?.[1] !== undefined) return Number(direct[1]);
  const token = /^var\((--perch-[a-z0-9-]+)\)$/.exec(value);
  if (token?.[1] === undefined || hops > 4) return null;
  const declared = new RegExp(`${token[1]}:\\s*([^;]+);`).exec(TOKENS);
  return declared?.[1] === undefined ? null : resolve(declared[1].trim(), hops + 1);
}

/** A token that has to stay a length, read the same way the rules read it. */
function token(name: string): number {
  const value = resolve(`var(${name})`);
  expect(value, `${name} is not a px length in the generated sheet`).not.toBeNull();
  return value!;
}

/**
 * Selectors cascade left to right. `bothAxes: false` marks a target sized by its
 * content on one axis — a text button is as wide as its label.
 */
const TARGETS: readonly {
  readonly name: string;
  readonly selectors: readonly string[];
  readonly bothAxes?: boolean;
}[] = [
  { name: "the switch", selectors: [".perch-toggle"] },
  { name: "an icon-only button", selectors: [".perch-button", ".perch-button--icon"] },
  { name: "a text button", selectors: [".perch-button"], bothAxes: false },
  {
    name: "the calendar's month navigation",
    selectors: [".perch-calendar__nav-button"],
  },
  { name: "the repeater's drag handle", selectors: [".perch-repeater__handle"] },
  {
    name: "a dialog's way out",
    // Held here as well as by the modal's own guard, because this is the list
    // somebody reads to ask what the floor covers.
    selectors: [".perch-modal__close"],
  },
  {
    name: "the markdown toolbar's buttons",
    // Added when that surface moved into the styling config, which is when it
    // became clear nothing asserted the floor for them: they are pointer
    // targets like every other control, and the only reason they met it was
    // that they happened to read the small-control height.
    // Both editors' toolbars, which are the same claim written twice: the
    // markdown one and the rich one carry identical buttons and met the floor
    // for the same accidental reason.
    selectors: [".perch-markdown__tool"],
  },
  {
    name: "the rich editor's toolbar buttons",
    selectors: [".perch-rich__tool"],
  },
  {
    name: "a toggle button",
    selectors: [".perch-toggles__label"],
    // The width is the words in it, which is not this file's to vouch for.
    bothAxes: false,
  },
  {
    // A row in a relation's combobox: pressed by a pointer, and the keyboard
    // moves a highlight along these rather than focus, so nothing else vouches
    // for how big one is.
    name: "a combobox result",
    selectors: [".perch-combobox__result"],
    // The width is the list's.
    bothAxes: false,
  },
];

describe("2.5.8 Target Size — 24 × 24 CSS px minimum", () => {
  it.each(TARGETS)("$name is at least 24 × 24", ({ selectors, bothAxes = true }) => {
    const box = declaredBox(selectors);
    expect(
      box.height,
      "no height declared, so nothing here can vouch for it",
    ).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET);
    if (!bothAxes) return;
    expect(
      box.width,
      "no width declared, so nothing here can vouch for it",
    ).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it("leaves a calendar day at least 24 px wide inside the panel", () => {
    // A day is `1fr` of a seven-column grid, so narrowing the panel shrinks 42
    // targets at once without touching the day's own rule.
    const panel = declaredBox([".perch-calendar"]).width;
    expect(panel, "the calendar panel declares no width").not.toBeNull();
    // Seven, not six: the gap is a margin each day carries rather than a gap
    // between grid columns, so every column spends one step and the two outer
    // ones are inside the panel's padding.
    const day =
      (panel! - token("--perch-space-6") * 2 - token("--perch-space-1") * 7) / 7;
    expect(
      day,
      `a day is ${day.toFixed(1)} px wide in a ${String(panel)} px panel`,
    ).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(declaredBox([".perch-calendar__day"]).height).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
  });

  it("keeps the switch's knob travel consistent with its box", () => {
    // The knob filled the padding box exactly at 22 px, so growing the track
    // without centring it left the knob high — a size assertion alone misses that.
    const box = declaredBox([".perch-toggle"]);
    const inner = box.width! - 2 - token("--perch-space-1") * 2; // 1 px border each side
    const knob = declaredBox([".perch-toggle__knob"]);
    const travel = /translateX\((\d+)px\)/.exec(
      blockFor('.perch-toggle[data-state="checked"] .perch-toggle__knob'),
    )?.[1];
    expect(travel, "no knob travel found on the checked knob").toBeDefined();
    expect(Number(travel), "the knob overshoots or falls short of the track").toBe(
      inner - knob.width!,
    );
  });

  /** Asserted against the rendered row in `a11y.test.tsx`; the two move together. */
  const ROW_ACTION_BUTTONS = 3;

  it("keeps the repeater's actions from being shrunk to fit", () => {
    // The row is a flex line now, so there is no track to be wide enough. The
    // guarantee is the same one from the other side: three buttons at 28 px
    // with 6 px between them need 96 px, and a flex item that may shrink is
    // the first thing asked to give it up.
    const actions = blockFor(".perch-repeater__actions");
    const button = declaredBox([".perch-button", ".perch-button--icon"]).width!;
    const needed =
      button * ROW_ACTION_BUTTONS + token("--perch-space-3") * (ROW_ACTION_BUTTONS - 1);

    expect(
      actions,
      `${String(ROW_ACTION_BUTTONS)} buttons need ${String(needed)} px, and a ` +
        "shrinkable row of them will be squeezed under 24 px",
    ).toMatch(/flex:\s*none;/);
  });

  it("refuses to let a flex parent shrink an icon button", () => {
    // A width is only a preference to a flex item.
    expect(blockFor(".perch-button--icon")).toMatch(/flex:\s*none;/);
  });

  /**
   * 2.5.8 has a second form and the dot look is the one surface that needs it.
   *
   * A radio's target is the dot and the label its `for` reaches, 18 px tall
   * because that is the dot: a 24 px square does not fit in it, and the size
   * form of the rule cannot be met without redrawing the control. The spacing
   * form can: an undersized target passes where a 24 px circle centred on it
   * meets neither another target nor another's circle.
   *
   * Stacked, that comes to the dot plus the gap between options, and it is 24
   * exactly — the two circles touch without overlapping, which the rule allows
   * and which leaves nothing in hand. A gap narrowed by one step, or a dot
   * drawn two pixels smaller, takes the panel out of conformance with every
   * other guard here still green. So the arithmetic is asserted rather than
   * the box, and nothing about how it looks is decided here.
   */
  it("spaces the dots far enough apart to stand in for their size", () => {
    const dot = declaredBox([".perch-radio__dot"]);
    expect(dot.height, "the dot declares no height to measure").not.toBeNull();

    // The row is as tall as the taller of the dot and the label's line box, and
    // the dot is the taller at every size the panel sets. Reading the dot is
    // therefore the pessimistic half: a label that grew would push the rows
    // further apart, never closer.
    // The gap read from the rule rather than from a token named here. Written
    // the other way, narrowing the gap by one step left this green: the test
    // was asserting arithmetic on a number it had chosen itself.
    const declared = /(?:^|;)\s*gap:\s*([^;]+)/.exec(blockFor(".perch-radio"));
    expect(declared?.[1], "the stacked dots declare no gap").toBeDefined();
    const gap = resolve(declared![1]!.trim());
    expect(gap, `the gap is not a px length: ${String(declared?.[1])}`).not.toBeNull();

    const pitch = dot.height! + gap!;

    expect(
      pitch,
      `a dot of ${String(dot.height)} px and a gap of ${String(gap)} px put ` +
        `${String(pitch)} px between the centres of two choices, and 2.5.8 asks ` +
        "for 24 where the target itself is smaller than that",
    ).toBeGreaterThanOrEqual(MIN_TARGET);

    // And the size form really is out of reach, so the exception is the only
    // thing holding this up: if the dot ever reaches 24 this test is the one to
    // delete, not to keep as a weaker duplicate.
    expect(dot.height).toBeLessThan(MIN_TARGET);
  });
});
