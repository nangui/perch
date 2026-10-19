/**
 * A theme reaches the recipes from wherever it is allowed to be written.
 *
 * The recipes do not read `--perch-surface`. They read Panda's alias of it,
 * `--perch-colors-surface: var(--perch-surface)`, and a custom property holding
 * a `var()` is resolved on the element that declares it and inherited from
 * there already resolved. Declared on `:root` alone, every alias froze at the
 * light ramp: `data-perch-theme="dark"` on `<body>`, which is what the guide
 * shows, darkened the page behind white tables, white inputs and a title
 * drawn in the light ramp's ink on the dark ramp's ground. A theme redefining
 * the accent on `.perch-root` had the same fate in light, and only the few
 * rules reading the published name directly followed it.
 *
 * jsdom resolves neither a cascade layer nor an inherited `var()`, so this
 * reads the sheet: the aliases are declared again everywhere the ramp or a
 * theme can be stamped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SHEET = readFileSync(join(import.meta.dirname, "panda.css"), "utf8");

/** The selector of the rule that declares the alias for `--perch-surface`. */
function aliasSelector(): string {
  const at = SHEET.indexOf("--perch-colors-surface: var(--perch-surface)");
  expect(at).toBeGreaterThan(-1);
  const open = SHEET.lastIndexOf("{", at);
  // Whichever closes last: the rule before it, or the `@layer` that holds it.
  const before = Math.max(
    SHEET.lastIndexOf("}", open),
    SHEET.lastIndexOf("{", open - 1),
  );
  return SHEET.slice(before + 1, open).trim();
}

describe("the token aliases", () => {
  it("are declared again where the dark ramp is stamped", () => {
    expect(aliasSelector()).toContain("[data-perch-theme]");
  });

  it("are declared again where a theme redefines a token", () => {
    expect(aliasSelector()).toContain(".perch-root");
  });

  it("still carry no specificity, so a theme wins without a fight", () => {
    expect(aliasSelector()).toMatch(/^:where\(/);
  });
});
