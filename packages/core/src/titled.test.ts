import { describe, expect, it } from "vitest";

import { titled } from "./titled.js";

describe("a path read as a heading", () => {
  it.each([
    ["name", "Name"],
    ["commonName", "Common name"],
    ["common_name", "Common name"],
    ["import-orders", "Import orders"],
    ["site.name", "Site name"],
    ["species.commonName", "Species common name"],
    ["HTTPCode", "Http code"],
  ])("reads %s as %s", (path, heading) => {
    expect(titled(path)).toBe(heading);
  });

  it("gives a path with nothing in it back rather than an empty heading", () => {
    // A label of "" is a field with no name at all, which reads as a bug in
    // the panel rather than in the resource that caused it.
    expect(titled("")).toBe("");
    expect(titled("   ")).toBe("   ");
  });

  it("keeps what the page titles already read", () => {
    // Two copies of this lived in `@perchjs/nest` for a page's own title, and
    // those titles must not move while the fallback is being widened.
    expect(titled("settings")).toBe("Settings");
    expect(titled("import-orders")).toBe("Import orders");
  });
});
