/**
 * A plugin styles itself with tokens the panel actually declares.
 *
 * The whole point of the panel's custom properties is that a field the
 * framework never heard of can take the accent, the muted grey and the focus
 * ring the rest of the page uses, and follow a theme it does not know exists.
 * That only holds if the names are real: `var(--perch-warning)` on a token
 * called `--perch-warning-content` falls through to whatever comes after the
 * comma, silently, and looks fine on the one screen somebody checked.
 *
 * `tokens-defined.test.ts` holds the same rule for the panel's own stylesheet
 * and reads only that file. A plugin is a script on a page, so nothing was
 * looking here — and the first star drawn with these tokens named one that does
 * not exist.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname;

const DECLARED = new Set(
  [
    ...readFileSync(join(ROOT, "packages/ui/src/tokens.css"), "utf8").matchAll(
      /--perch-([\w-]+):/g,
    ),
  ].map((found) => found[1] ?? ""),
);

/** Every script a panel loads beside its own bundle. */
function pluginScripts(): readonly { readonly name: string; readonly source: string }[] {
  const here = join(ROOT, "examples/basic/public");
  const found: { name: string; source: string }[] = [];
  for (const file of readdirSync(here)) {
    if (!file.endsWith(".js")) continue;
    if (!statSync(join(here, file)).isFile()) continue;

    found.push({ name: file, source: readFileSync(join(here, file), "utf8") });
  }
  return found;
}

describe("a field the framework does not ship", () => {
  const scripts = pluginScripts();

  it("is there to be read", () => {
    // Guards the guard: no scripts means every case below passes by having none.
    expect(scripts.length).toBeGreaterThan(0);
  });

  it("declares tokens the panel knows about", () => {
    expect(DECLARED.size).toBeGreaterThan(50);

    const unknown = scripts.flatMap(({ name, source }) =>
      [...source.matchAll(/var\(--perch-([\w-]+)/g)]
        .map((found) => found[1] ?? "")
        .filter((token) => !DECLARED.has(token))
        .map((token) => `${name}: --perch-${token}`),
    );

    expect(unknown).toEqual([]);
  });

  it("gives each one something to fall back to", () => {
    // A panel is a page somebody else's stylesheet also loads. Where the token
    // is missing the field should still be legible rather than inherit whatever
    // was there — which for a colour is usually the body text.
    const bare = scripts.flatMap(({ name, source }) =>
      [...source.matchAll(/var\(--perch-[\w-]+([^)]*)\)/g)]
        .filter((found) => !(found[1] ?? "").includes(","))
        .map((found) => `${name}: ${found[0]}`),
    );

    expect(bare).toEqual([]);
  });
});
