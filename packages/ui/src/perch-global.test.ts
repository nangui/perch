/**
 * The object a plugin compiles against.
 *
 * `window.perch` is how a renderer written outside this bundle reaches the
 * registry, and it is the only thing this bundle puts on the window. That makes
 * it a published contract with none of the protection the served entries have:
 * the manifest version covers those, and renaming a key here would break every
 * plugin at once, at run time, in somebody else's deployment.
 *
 * Read off the source rather than imported, because importing the panel entry
 * mounts a panel — it looks for its element the moment it is evaluated.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function panel(): string {
  return readFileSync(new URL("./panel.tsx", import.meta.url), "utf8");
}

/** The keys the object is built with, off the literal that builds it. */
function keys(): readonly string[] {
  const built = /export const PERCH_GLOBAL: PerchGlobal = \{([\s\S]*?)\n\};/.exec(
    panel(),
  );
  if (built === null) throw new Error("PERCH_GLOBAL is not where this expected it");

  return [...(built[1] ?? "").matchAll(/^\s*(\w+)[,:]/gm)]
    .flatMap((found) => (found[1] === undefined ? [] : [found[1]]))
    .sort();
}

describe("what a plugin is promised", () => {
  it("is exactly these three, and changing that is a version bump", () => {
    // Matched, not contained: a key removed breaks a plugin as surely as a key
    // renamed, and a list that only grows says nothing about either.
    expect(keys()).toEqual(["createElement", "registerComponent", "version"]);
  });

  it("carries the version a plugin checks before it trusts the rest", () => {
    expect(panel()).toMatch(/export const PANEL_GLOBAL_VERSION = \d+;/);
    expect(panel()).toContain("version: PANEL_GLOBAL_VERSION");
  });

  it("is the only thing this bundle puts on the window", () => {
    // A second global is a second contract nobody versioned.
    const assignments = [...panel().matchAll(/^window\.(\w+)\s*=/gm)].map(
      (found) => found[1],
    );

    expect(assignments).toEqual(["perch"]);
  });
});
