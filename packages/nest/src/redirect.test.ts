/**
 * The redirect is built from the URL that reached the route, so it decides
 * where a browser goes next. What it may never be is somewhere else entirely.
 */
import { describe, expect, it } from "vitest";
import { rootOf, sameOrigin } from "./panel-root.js";

const asRequest = (url: string) => ({ originalUrl: url });

describe("the root a redirect is built on", () => {
  it("is the mount, whatever the host put in front of it", () => {
    expect(rootOf(asRequest("/admin/api/people"), "api/people")).toBe("/admin");
    expect(rootOf(asRequest("/api/v1/admin/api/people"), "api/people")).toBe(
      "/api/v1/admin",
    );
  });

  it("would carry another origin if a router ever let one through", () => {
    // Express refuses to route `//evil.com/admin/api/people` at all, which is
    // why this is a note rather than a hole. The controller refuses the result
    // anyway, because relying on how strictly a router normalises paths is not
    // a security argument.
    expect(rootOf(asRequest("//evil.com/admin/api/people"), "api/people")).toBe(
      "//evil.com/admin",
    );
  });

  it("refuses a URL that does not contain the route at all", () => {
    expect(() => rootOf(asRequest("/somewhere/else"), "api/people")).toThrow();
  });
});

describe("what may be handed to a browser", () => {
  it("keeps a place on this origin", () => {
    expect(sameOrigin("/admin/people/2/edit")).toBe("/admin/people/2/edit");
    expect(sameOrigin("/api/v1/admin/people/2/edit")).toBe(
      "/api/v1/admin/people/2/edit",
    );
  });

  it.each([
    ["another origin, spelled without a scheme", "//evil.com/admin/people/2/edit"],
    ["another origin, spelled with one", "https://evil.com/x"],
    ["something relative, which resolves against the current page", "people/2/edit"],
    ["nothing at all", ""],
  ])("refuses %s", (_, where) => {
    expect(sameOrigin(where)).toBeUndefined();
  });
});
