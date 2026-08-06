/**
 * Contrast, computed from the tokens themselves.
 *
 * ARCH 13 §10 does not say "aim for AA" — it says *"Contraste AA minimum, vérifié
 * en CI"*. This is that check, and it runs on the token file rather than on
 * screenshots: the numbers are in `tokens.css`, so the assertion belongs there
 * too. A rendered-page audit would catch the same failures later, slower, and
 * only for the pages someone thought to visit.
 *
 * Thresholds are WCAG 2.2: 4.5:1 for body text, 3:1 for large text and for the
 * non-text parts a user must be able to see — a control's border, a focus ring.
 *
 * Both themes are checked. The dark ramp is derived rather than designed, which
 * makes it exactly the one most likely to be wrong.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOKENS = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const AA_TEXT = 4.5;
const AA_LARGE = 3;

/**
 * Reads one theme's values. Blocks are ordered light, dark, then the
 * prefers-color-scheme duplicate; taking the first match per theme is enough
 * because the duplicate carries the same values.
 */
function theme(name: "light" | "dark"): Record<string, string> {
  const marker =
    name === "light"
      ? /:where\(:root\),\s*:where\(\[data-perch-theme="light"\]\)\s*\{([\s\S]*?)\n\}/
      : /:where\(\[data-perch-theme="dark"\]\)\s*\{([\s\S]*?)\n\}/;
  const block = marker.exec(TOKENS)?.[1];
  if (block === undefined)
    throw new Error(`No ${name} token block found in tokens.css`);

  const values: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^\s*(--perch-[a-z0-9-]+):\s*(.+?);/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

function channel(component: number): number {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pairs that must hold, and the reason each one matters. */
const TEXT_PAIRS: readonly (readonly [string, string, string])[] = [
  ["--perch-content", "--perch-surface", "body text on a card"],
  ["--perch-content", "--perch-surface-page", "body text on the page ground"],
  [
    "--perch-content",
    "--perch-surface-muted",
    "text in a disabled or read-only control",
  ],
  ["--perch-content-secondary", "--perch-surface-muted", "read-only textarea body"],
  ["--perch-content-muted", "--perch-surface", "help text — the reserved line"],
  ["--perch-content-muted", "--perch-surface-muted", "help text over a muted control"],
  ["--perch-content-subtle", "--perch-surface", "placeholder and meta"],
  ["--perch-content-subtle", "--perch-surface-muted", "placeholder in a muted control"],
  ["--perch-accent", "--perch-surface", "accent text and the chevron on focus"],
  ["--perch-accent", "--perch-accent-surface", "accent text on its own tint"],
  ["--perch-danger-content", "--perch-surface", "error message on the reserved line"],
  ["--perch-danger-content", "--perch-danger-surface", "error message on its tint"],
  ["--perch-content-inverse", "--perch-accent", "label on a primary button"],
  ["--perch-content-inverse", "--perch-danger", "the error badge glyph"],
  ["--perch-warning-content", "--perch-warning-surface", "warning badge"],
  ["--perch-success-content", "--perch-success-surface", "success badge"],
];

/** Non-text: a user must be able to make out the edge of a control. */
const UI_PAIRS: readonly (readonly [string, string, string])[] = [
  ["--perch-border-strong", "--perch-surface", "the resting edge of a control"],
  ["--perch-border-hover", "--perch-surface", "the edge on hover"],
  ["--perch-accent", "--perch-surface", "the focus ring against a card"],
  ["--perch-danger", "--perch-surface", "the border of an invalid control"],
];

/**
 * The border ramp has to keep its order, and that is not obvious to the eye.
 *
 * Raising `--perch-border-strong` to clear 1.4.11 left it darker than
 * `--perch-border-hover`, which inverted the interaction: hovering *weakened* the
 * edge, the opposite of what the design describes. Contrast alone would not have
 * caught it — both values passed their own thresholds. So the ordering is
 * asserted, in both themes, where "stronger" means further from the surface.
 */
const RAMP: readonly string[] = [
  "--perch-border-subtle",
  "--perch-border",
  "--perch-border-strong",
  "--perch-border-hover",
];

/**
 * A failure that belongs to the source design, recorded rather than hidden.
 *
 * `--perch-border-strong` is the resting border of every control. The design set
 * it to a light cool grey, and against white that measures 1.66:1 — WCAG 2.2
 * §1.4.11 asks 3:1 of a user-interface component, so the edge of a control is not
 * guaranteed visible to someone with low vision.
 *
 * It is not silently corrected here because darkening it visibly changes the
 * design's restraint, and that is the designer's call, not this file's. It is not
 * silently accepted either: the current ratio is asserted, so changing the token
 * — in either direction — fails this test and forces the decision to be made
 * again rather than drifting.
 *
 * The computed options, should it be corrected: #8b959b is the lightest value
 * that reaches 3:1 on white (3.06:1); #767f84 gives comfortable headroom
 * (4.09:1) and stays distinct from `--perch-border`. Dark theme needs #616c72
 * or darker.
 */
/**
 * Contrast failures accepted on purpose, with the reason and the measured ratio.
 *
 * Empty, and that is the point: `--perch-border-strong` lived here until the
 * value was corrected. Anything added must carry why it is tolerable, and the
 * assertion below locks the measured ratio so the deviation cannot quietly get
 * worse.
 */
const KNOWN_DEVIATIONS: readonly {
  readonly theme: "light" | "dark";
  readonly fg: string;
  readonly bg: string;
  readonly ratio: number;
  readonly required: number;
}[] = [];

describe("known contrast deviations", () => {
  it("has none, or each is measured below its threshold", () => {
    expect(Array.isArray(KNOWN_DEVIATIONS)).toBe(true);
  });

  it.each(KNOWN_DEVIATIONS)(
    "$theme: $fg on $bg is still $ratio:1, below $required:1",
    ({ theme: name, fg, bg, ratio: expected, required }) => {
      const tokens = theme(name);
      const actual = ratio(tokens[fg]!, tokens[bg]!);
      // Asserted on the failing value on purpose. If someone fixes the token this
      // test goes red, which is the prompt to move the pair into UI_PAIRS.
      expect(actual).toBeCloseTo(expected, 1);
      expect(
        actual,
        "This deviation appears to have been fixed — move the pair into UI_PAIRS " +
          "and delete it from KNOWN_DEVIATIONS.",
      ).toBeLessThan(required);
    },
  );
});

describe.each(["light", "dark"] as const)("contrast — %s theme", (name) => {
  const tokens = theme(name);

  it.each(TEXT_PAIRS)("%s on %s reaches AA for text (%s)", (fg, bg) => {
    const a = tokens[fg];
    const b = tokens[bg];
    expect(a, `${fg} missing from the ${name} theme`).toBeDefined();
    expect(b, `${bg} missing from the ${name} theme`).toBeDefined();
    const r = ratio(a!, b!);
    expect(
      r,
      `${fg} (${a!}) on ${bg} (${b!}) is ${r.toFixed(2)}:1, below ${String(AA_TEXT)}:1`,
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(UI_PAIRS)("%s on %s reaches AA for non-text (%s)", (fg, bg) => {
    const a = tokens[fg];
    const b = tokens[bg];
    const r = ratio(a!, b!);
    expect(
      r,
      `${fg} (${a!}) on ${bg} (${b!}) is ${r.toFixed(2)}:1, below ${String(AA_LARGE)}:1`,
    ).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("keeps the border ramp monotonic, so hover never weakens the edge", () => {
    const distances = RAMP.map((token) => {
      const value = tokens[token];
      expect(value, `${token} missing from the ${name} theme`).toBeDefined();
      return { token, contrast: ratio(value!, tokens["--perch-surface"]!) };
    });
    for (let i = 1; i < distances.length; i += 1) {
      const previous = distances[i - 1]!;
      const current = distances[i]!;
      expect(
        current.contrast,
        `${current.token} (${current.contrast.toFixed(2)}:1) must stand out more ` +
          `than ${previous.token} (${previous.contrast.toFixed(2)}:1), otherwise ` +
          `the ramp inverts and hovering weakens the border`,
      ).toBeGreaterThan(previous.contrast);
    }
  });

  it("defines every token the other theme defines", () => {
    // A token present in one theme and absent from the other inherits the wrong
    // value silently, which is the quietest way to break dark mode.
    const other = theme(name === "light" ? "dark" : "light");
    const missing = Object.keys(other).filter((key) => !(key in tokens));
    expect(missing, `absent from the ${name} theme`).toEqual([]);
  });
});
