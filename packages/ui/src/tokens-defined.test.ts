/**
 * Every token the stylesheet reads is one the stylesheet defines.
 *
 * A `var(--perch-nope)` with no fallback is not an error anywhere: the property
 * is dropped and the element inherits. It looks like a design decision. This
 * caught `--perch-text-title`, invented for a heading and never defined.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

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
