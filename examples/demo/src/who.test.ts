/**
 * Who a visitor to the public demo is allowed to claim to be.
 *
 * Anybody can be a warden here by asking, which is the point rather than an
 * oversight: nobody is signed in, and the extra column a warden sees is there
 * to show that the panel does what a resolver says. The test is here so that
 * stays a decision. A demo that quietly started trusting `?as=` for something
 * that matters would read exactly like this one.
 */
import { describe, expect, it } from "vitest";
import { isWarden, QueryUserResolver } from "./who.js";

const asking = (url: string): unknown => new QueryUserResolver().resolve({ url });

describe("who the demo thinks is asking", () => {
  it("is a visitor when nothing is asked", () => {
    expect(asking("/admin/sightings")).toEqual({ role: "visitor" });
    expect(isWarden(asking("/admin/sightings"))).toBe(false);
  });

  it("is whoever the address asks for, on purpose", () => {
    expect(asking("/admin/sightings?as=warden")).toEqual({ role: "warden" });
    expect(isWarden(asking("/admin/sightings?as=warden"))).toBe(true);
  });

  it("reads it after another parameter too", () => {
    expect(isWarden(asking("/admin/sightings?page=2&as=warden"))).toBe(true);
  });

  it("takes only lowercase letters, so nothing else becomes a role", () => {
    for (const url of [
      "/admin?as=WARDEN",
      "/admin?as=warden2",
      "/admin?notas=warden",
      "/admin?as=",
      "/admin#as=warden",
    ]) {
      expect(isWarden(asking(url)), `from ${url}`).toBe(false);
    }
  });

  it("answers for a request with no address at all", () => {
    expect(new QueryUserResolver().resolve({})).toEqual({ role: "visitor" });
  });
});
