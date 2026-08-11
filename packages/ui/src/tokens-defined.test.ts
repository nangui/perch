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

/**
 * Which declaration actually wins, for a set of classes.
 *
 * Plain class chains only — no pseudo-classes, no attributes — so this answers
 * one question and asks nothing about states. Equal specificity throughout, so
 * source order decides, which is exactly the part that is easy to get wrong.
 */
function resting(styles: string, classes: readonly string[]): Map<string, string> {
  const won = new Map<string, string>();

  for (const rule of styles.matchAll(/^(\.[^{@\n][^{]*)\{([^}]*)\}/gms)) {
    for (const selector of (rule[1] ?? "").split(",").map((one) => one.trim())) {
      if (!/^(\.[\w-]+)+$/.test(selector)) continue;
      const needed = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
      if (!needed.every((one) => classes.includes(one ?? ""))) continue;

      for (const declaration of (rule[2] ?? "").split(";")) {
        const [property, value] = declaration.split(":");
        if (property === undefined || value === undefined) continue;
        won.set(property.trim(), value.trim());
      }
    }
  }
  return won;
}

describe("what each button variant resolves to", () => {
  /**
   * A modifier that loses to the base class is a modifier that does nothing,
   * and nothing else here would say so: a second `.perch-button` block written
   * for the list page's create link sat below the first and repainted every
   * button in the panel — primary, icon and danger alike — for several
   * releases. Every test passed throughout.
   */
  it.each([
    ["a plain button", ["perch-button"], "background", "var(--perch-surface)"],
    ["a plain button", ["perch-button"], "color", "var(--perch-content)"],
    [
      "a primary button",
      ["perch-button", "perch-button--primary"],
      "background",
      "var(--perch-accent)",
    ],
    [
      "an icon button",
      ["perch-button", "perch-button--icon"],
      "color",
      "var(--perch-content-muted)",
    ],
    [
      "a danger button",
      ["perch-button", "perch-button--danger"],
      "color",
      "var(--perch-danger)",
    ],
  ])("gives %s the %s its modifier asks for", (_what, classes, property, expected) => {
    expect(resting(read("styles.css"), classes).get(property)).toBe(expected);
  });
});
