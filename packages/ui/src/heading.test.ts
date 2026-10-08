/**
 * The renderer's copy of `titled`, held level with the one in the domain.
 *
 * It is a copy because core is a development dependency of this package: a
 * value taken from it compiles here and fails for whoever installs the
 * renderer. A test may reach for it, which is what the boundary rule exempts,
 * so the two are compared here rather than left to drift — the page titles and
 * the column headings reading differently is exactly what nobody would notice.
 */
import { titled } from "@perchjs/core";
import { describe, expect, it } from "vitest";

import { headingOf } from "./heading.js";

const PATHS = [
  "name",
  "commonName",
  "common_name",
  "import-orders",
  "site.name",
  "species.commonName",
  "HTTPCode",
  "",
] as const;

describe("a path read as a heading", () => {
  it.each(PATHS)("reads %s the way the domain does", (path) => {
    expect(headingOf({ path })).toBe(titled(path));
  });

  it("keeps a label the resource gave, including an empty one", () => {
    expect(headingOf({ label: "Seen", path: "seenAt" })).toBe("Seen");
    // Deliberately blank is not unnamed: a field may want no label at all.
    expect(headingOf({ label: "", path: "seenAt" })).toBe("");
  });

  it("has nothing to say about a node with no path either", () => {
    expect(headingOf({})).toBe("");
  });
});
