/**
 * WCAG 2.2 §2.5.8 — 24 × 24 CSS px per pointer target, read from the stylesheet
 * because jsdom computes no layout and a rendered box would measure zero. Same
 * approach as `contrast.test.ts` against `tokens.css`.
 *
 * Reading declarations cannot see a target squeezed by its container, so where a
 * container decides the size the container is checked instead.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const TOKENS = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

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
  const found = new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(STYLES);
  if (found?.[1] === undefined) {
    throw new Error(`No rule for ${selector} in styles.css — has it been renamed?`);
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

function resolve(value: string): number | null {
  const direct = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (direct?.[1] !== undefined) return Number(direct[1]);
  const token = /^var\((--perch-[a-z0-9-]+)\)$/.exec(value);
  if (token?.[1] === undefined) return null;
  const declared = new RegExp(`${token[1]}:\\s*(\\d+(?:\\.\\d+)?)px;`).exec(TOKENS);
  return declared?.[1] === undefined ? null : Number(declared[1]);
}

/** A token that has to stay a length, read the same way the rules read it. */
function token(name: string): number {
  const value = resolve(`var(${name})`);
  expect(value, `${name} is not a px length in tokens.css`).not.toBeNull();
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
    name: "a toggle button",
    selectors: [".perch-toggles__label"],
    // The width is the words in it, which is not this file's to vouch for.
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
    const day =
      (panel! - token("--perch-space-6") * 2 - token("--perch-space-1") * 6) / 7;
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
});
