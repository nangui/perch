/**
 * No control draws its icon as a character.
 *
 * A glyph is whatever the reader's font decided. `▦` is a hatched square on one
 * machine and a solid block on another, and neither reads as a calendar; an
 * emoji is a colour picture at a size nobody chose, in a panel drawn in one
 * accent. The rest of the panel draws shapes, and a control that reaches for a
 * character is the one thing on the page that looks like it came from
 * somewhere else.
 *
 * Read from the sources, because this is about what is written rather than
 * about what a browser makes of it — which is the whole complaint.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graphemesOf } from "./graphemes.js";

const HERE = new URL("./", import.meta.url).pathname;

/** Every component file in this package. */
function sources(): readonly { readonly name: string; readonly text: string }[] {
  const found: { name: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path, `${prefix}${entry}/`);
        continue;
      }
      if (!entry.endsWith(".tsx") || entry.includes(".test.")) continue;
      found.push({ name: `${prefix}${entry}`, text: readFileSync(path, "utf8") });
    }
  };
  walk(HERE, "");
  return found;
}

/**
 * Characters a control may still draw as text.
 *
 * Marks that stand in for a value rather than for an action: the dash a cell
 * shows for nothing, the tick and cross a boolean column draws, the asterisk
 * beside a required label. Each is read as content, and each is listed here so
 * the set stays a decision rather than a drift.
 */
const ALLOWED = new Set(["—", "–", "✓", "✕", "×", "*", "·", "+"]);

describe("an icon in the panel", () => {
  const files = sources();

  it("is looked for in more than one file", () => {
    // Guards the guard: no sources means every case below passes vacuously.
    expect(files.length).toBeGreaterThan(10);
  });

  it("is never a character a font gets to choose", () => {
    const drawn = files.flatMap(({ name, text }) =>
      [...text.matchAll(/>\s*\n?\s*([^\s<>{}/]{1,2})\s*\n?\s*<\//g)]
        .map((found) => found[1] ?? "")
        // Anything outside printable ASCII is a mark rather than punctuation.
        // Written with escapes: this held a literal NUL and a literal DEL, which
        // is a pair of invisible bytes in a source file and the reason a
        // `no-control-regex` directive sat above it.
        .filter((one) => /[^\x20-\x7E]/.test(one))
        .filter((one) => !graphemesOf(one).every((ch) => ALLOWED.has(ch)))
        .map((one) => `${name}: ${one}`),
    );

    expect(drawn).toEqual([]);
  });
});

describe("a button that carries a drawn mark", () => {
  /**
   * The buttons that carry a drawn mark and nothing else to place it.
   *
   * Not buttons holding nothing else: the repeater's handle stacks the grip
   * over the row's number, which is why measuring the mark against the whole
   * button reads as a 12px offset and is not one.
   *
   * The fold button joined them when its caret stopped being a character. That
   * is the moment to add one here — a box that placed a glyph by the typography
   * around it places a drawing nowhere in particular.
   */
  const CARRIERS = [
    ".perch-row-actions__open",
    ".perch-cell__copy",
    ".perch-repeater__handle",
    ".perch-repeater__fold",
  ] as const;

  it.each(CARRIERS)("%s centres it", (selector) => {
    // A shape replacing a character stops being placed by the typography that
    // used to place it: an inline SVG sits on a baseline, and one of these three
    // came out 3px high in a 24px button because it was left in flow. Held as
    // the mechanism rather than as a position, since jsdom computes neither.
    // Anchored to the start of a line: unanchored, this found the same class
    // inside a compound selector and read a rule about a cursor.
    // Both sheets, and leading space allowed on both braces: a carrier may be
    // declared in either while the stylesheet is being moved a surface at a
    // time, and a generated rule sits inside a cascade layer and is therefore
    // indented.
    const sheets = [
      readFileSync(new URL("./panda.css", import.meta.url), "utf8"),
      readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
    ].join("\n");
    const rule = new RegExp(
      `^\\s*${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
      "m",
    ).exec(sheets)?.[1];

    expect(rule, `no rule for ${selector}`).toBeDefined();
    expect(rule).toMatch(/display: (inline-)?flex/);
    expect(rule).toContain("align-items: center");
    expect(rule).toContain("justify-content: center");
  });
});
