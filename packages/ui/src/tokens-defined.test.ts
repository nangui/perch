/**
 * Every token the stylesheet reads is one the stylesheet defines.
 *
 * A `var(--perch-nope)` with no fallback is not an error anywhere: the property
 * is dropped and the element inherits. It looks like a design decision. This
 * caught `--perch-text-title`, invented for a heading and never defined.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

/**
 * Every component, found rather than listed. A named list would go stale on the
 * file that needs the guard most — the one somebody has just written.
 */
function components(): readonly string[] {
  const root = new URL(".", import.meta.url);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => readFileSync(new URL(name, root), "utf8"));
}

/**
 * Anything that names a colour rather than reading one.
 *
 * Named words are left out on purpose: `currentColor`, `transparent` and
 * `none` carry no value of their own, so they are re-themable by whatever they
 * inherit from.
 *
 * Twice, and not because one of them would do. A global regexp keeps its
 * `lastIndex` between calls, so the same pattern used for `test` in a loop
 * answers yes, no, yes to identical strings — which is a guard that reports
 * every other offence. The counted form is separate for that reason alone.
 */
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|color-mix|lab|lch)\(/i;
const EVERY_COLOUR = new RegExp(COLOUR.source, "gi");

/**
 * The stylesheet with its prose removed.
 *
 * This file explains itself at length, and a comment that mentions the hex a
 * token was lifted from is a comment doing its job rather than a rule breaking
 * one.
 */
function code(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

describe("the token contract", () => {
  it("defines every variable the stylesheet reads without a fallback", () => {
    const tokens = read("tokens.css");
    const styles = read("styles.css");

    // `var(--x, fallback)` is a deliberate runtime variable — `--perch-columns`
    // is set by the layout renderer as an inline style — so only the bare form
    // has to be defined here.
    const bare = [...styles.matchAll(/var\((--perch-[a-z0-9-]+)\)/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    const missing = [...new Set(bare)].filter((name) => !tokens.includes(`${name}:`));

    expect(missing, `undefined in tokens.css: ${missing.join(", ")}`).toEqual([]);
    expect(bare.length).toBeGreaterThan(20);
  });

  it("hides no colour in a fallback, where no theme could reach it", () => {
    // The hole the test above leaves open, and it was being used. A fallback is
    // exempt from the check because `var(--perch-columns, 1)` is a runtime
    // value a renderer sets, not a token — but the exemption also covered
    // `var(--perch-shadow-2, 0 8px 24px rgb(0 0 0 / 12%))`, where the token was
    // declared nowhere, the fallback was therefore always what rendered, and a
    // raw colour sat in a file whose header says it names none.
    //
    // So the rule is about colour rather than about declaration: a runtime
    // length may have a fallback and a colour may not, because a colour behind
    // a `var()` is a colour no theme can replace.
    const found: string[] = [];
    for (const match of code(read("styles.css")).matchAll(
      /var\(\s*(--perch-[a-z0-9-]+)\s*,([^;]*)/g,
    )) {
      if (COLOUR.test(match[2] ?? "")) found.push(match[1] ?? "");
    }

    expect(
      found,
      `a colour behind a fallback, which a theme cannot replace: ${found.join(", ")}`,
    ).toEqual([]);
  });

  it("names a colour nowhere but in the token layer", () => {
    // What `styles.css` already claims in its own header: "Not one raw colour
    // appears below. Every value is a token from tokens.css, which is what
    // makes the panel re-themable by replacing that one file." It was not quite
    // true — a modal's backdrop named its own ink — and a promise nothing holds
    // is worth less than one nobody made.
    const raw = [...code(read("styles.css")).matchAll(EVERY_COLOUR)].map(
      (one) => one[0],
    );

    expect(
      raw,
      `raw colour in styles.css, which no theme can replace: ${raw.join(", ")}`,
    ).toEqual([]);
  });
});

describe("what an unavailable control looks like", () => {
  it("styles every control the components mark with aria-disabled", () => {
    // `aria-disabled` keeps a control in the tab order, which is why the
    // pagination, the repeater's reordering and the empty Select all use it —
    // but it changes nothing a reader can see. `:disabled` rules do not apply
    // to it, so without a hook of its own a control with nowhere to go looks
    // exactly as pressable as one that works. `[data-disabled="true"]` is that
    // hook here.
    const styles = read("styles.css");

    // Per element, not per class: `perch-button perch-button--icon` needs one
    // rule between the two of them, and asking for both fails on a modifier
    // that only adjusts a shape.
    const controls: string[][] = [];

    for (const source of components()) {
      for (const match of source.matchAll(/aria-disabled=/g)) {
        // The class on the same element, which is the one a rule can reach.
        const around = source.slice(Math.max(match.index - 400, 0), match.index);
        const className = /className="([^"]*)"(?![\s\S]*className=")/.exec(around)?.[1];
        const classes = (className ?? "")
          .split(/\s+/)
          .filter((single) => single.startsWith("perch-"));
        if (classes.length > 0) controls.push(classes);
      }
    }

    expect(
      controls.length,
      "no component marks aria-disabled — has this moved?",
    ).toBeGreaterThan(0);
    const unstyled = controls.filter(
      (classes) =>
        !classes.some((single) => styles.includes(`.${single}[data-disabled="true"]`)),
    );

    expect(
      unstyled.map((classes) => classes.join(" ")),
      "marked unavailable and styled by nothing",
    ).toEqual([]);
  });
});
