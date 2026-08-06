/**
 * Target size, read from the stylesheet.
 *
 * WCAG 2.2 §2.5.8 asks 24 × 24 CSS px of a pointer target. This is checked here
 * rather than in `a11y.test.tsx` because it is static analysis, not a DOM
 * assertion — the same reason `contrast.test.ts` computes ratios from
 * `tokens.css`. jsdom computes no layout at all, so a rendered check would
 * measure zeros and pass everything.
 *
 * The limit of reading declarations: it cannot catch a target squeezed by its
 * container. It does catch the failure that actually happens, which is a control
 * declared at 22 px. Where a container decides the size — the calendar's days —
 * the container is checked instead.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const TOKENS = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const MIN_TARGET = 24;

/**
 * The declared box of a selector, `var()` resolved against the token file.
 * `null` means the dimension is not declared, so it is set by the content or by
 * the parent layout and this file cannot speak to it.
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
 * Selectors cascade left to right, so a modifier can be listed after the base it
 * refines. `bothAxes: false` marks a target sized by its content on one axis — a
 * text button is as wide as its label, and no declaration can promise that.
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
    // A day's width is `1fr` of a seven-column grid, so the panel decides it.
    // Narrowing the panel is the plausible regression, and it would shrink 42
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
    // The switch was 22 px tall and its knob filled the padding box exactly, so
    // growing the track without centring the knob would have left it 2 px high —
    // the kind of defect a size assertion alone does not see.
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

  /**
   * How many icon buttons a repeater row puts in its last track. Asserted against
   * the rendered row in `a11y.test.tsx` — the two have to move together, and this
   * is the pair that already went wrong once: the track was sized for two buttons
   * and a third was added, which let flex compress all three to 19 px.
   */
  const ROW_ACTION_BUTTONS = 3;

  it("gives the repeater's action column room for every button in it", () => {
    const row = blockFor(".perch-repeater__row");
    // The last bare length in the template is the actions track.
    const track = /grid-template-columns:[^;]*\s(\d+)px;/.exec(row)?.[1];
    expect(track, "no fixed last track in the row template").toBeDefined();
    const button = declaredBox([".perch-button", ".perch-button--icon"]).width!;
    const needed =
      button * ROW_ACTION_BUTTONS + token("--perch-space-3") * (ROW_ACTION_BUTTONS - 1);
    expect(
      Number(track),
      `${String(ROW_ACTION_BUTTONS)} buttons need ${String(needed)} px, the track is ` +
        `${String(track)} px — they will be squeezed under 24 px`,
    ).toBeGreaterThanOrEqual(needed);
  });

  it("refuses to let a flex parent shrink an icon button", () => {
    // A width is only a preference to a flex item; without `flex: none` a tight
    // container compresses it and the declared 28 px means nothing.
    expect(blockFor(".perch-button--icon")).toMatch(/flex:\s*none;/);
  });
});
