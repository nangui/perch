/**
 * The renderer and the adapter name the same header.
 *
 * One route of the panel cannot be JSON, so it says who it is with a header
 * instead, and the adapter refuses it without one. The name is written twice
 * because it has to be: the renderer imports no value from anywhere, by a rule
 * a dependency cruise holds, so there is no constant for the two to share.
 *
 * Two files, neither able to see the other, and a disagreement that fails
 * nowhere: uploads would answer 404 and every other route would carry on
 * working, which is the sort of break somebody finds in a week.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

/** What the adapter reads, off its own declaration. */
function declared(): string {
  const found = /PANEL_REQUEST_HEADER = "([^"]+)"/.exec(
    read("packages/nest/src/cross-site.ts"),
  );
  expect(
    found?.[1],
    "the adapter no longer declares the header where this looks",
  ).toBeDefined();
  return found?.[1] ?? "";
}

/** What the renderer sends, off the request it sends it on. */
function sent(): readonly string[] {
  return [...read("packages/ui/src/panel.tsx").matchAll(/"(x-[a-z-]+)":\s*"/g)].map(
    (found) => found[1] ?? "",
  );
}

describe("the header the one non-JSON route asks for", () => {
  it("is the one the renderer sends", () => {
    expect(sent(), `the renderer sends no ${declared()}`).toContain(declared());
  });

  it("is the only x- header the renderer sends", () => {
    // A second would mean this test is reading the wrong one and passing by
    // accident.
    expect(new Set(sent())).toEqual(new Set([declared()]));
  });
});
