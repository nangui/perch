/**
 * @vitest-environment jsdom
 *
 * What a reader arranged, kept between visits.
 *
 * Everything here has to fail quietly. Storage is refused in private windows,
 * full on some phones, and absent while rendering on a server — none of which
 * is worth a table that will not draw. The cost of forgetting is that somebody
 * arranges it again; the cost of throwing is a blank page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { remember, remembered } from "./remembered.js";

beforeEach(() => {
  globalThis.localStorage.clear();
  vi.restoreAllMocks();
});

describe("keeping an arrangement", () => {
  it("gives back what was put there", () => {
    remember("/admin/people", { hidden: ["homepage"], perPage: 50 });

    expect(remembered("/admin/people")).toEqual({
      hidden: ["homepage"],
      perPage: 50,
    });
  });

  it("keeps two tables apart", () => {
    remember("/admin/people", { perPage: 50 });
    remember("/admin/teams", { perPage: 10 });

    expect(remembered("/admin/people").perPage).toBe(50);
    expect(remembered("/admin/teams").perPage).toBe(10);
  });

  it("leaves the other half alone when one is written", () => {
    remember("/admin/people", { hidden: ["homepage"] });
    remember("/admin/people", { perPage: 50 });

    expect(remembered("/admin/people")).toEqual({
      hidden: ["homepage"],
      perPage: 50,
    });
  });

  it("remembers nothing for a table with no address of its own", () => {
    // A relation manager's, drawn under a record. Sharing a key with another
    // would leak one tab's arrangement into the next, which is worse than
    // forgetting.
    remember(undefined, { perPage: 50 });

    expect(remembered(undefined)).toEqual({});
    expect(globalThis.localStorage.length).toBe(0);
  });
});

describe("what is already in storage", () => {
  it("is ignored when it is not what this expects", () => {
    // Written by an older version of this file as readily as by this one.
    globalThis.localStorage.setItem("perch.table./admin/people", "not json");
    expect(remembered("/admin/people")).toEqual({});

    globalThis.localStorage.setItem("perch.table./admin/people", '{"perPage":"lots"}');
    expect(remembered("/admin/people")).toEqual({});

    globalThis.localStorage.setItem("perch.table./admin/people", '{"hidden":"one"}');
    expect(remembered("/admin/people")).toEqual({});
  });

  it("keeps only the strings out of a list of anything", () => {
    globalThis.localStorage.setItem(
      "perch.table./admin/people",
      '{"hidden":["homepage",7,null]}',
    );

    expect(remembered("/admin/people").hidden).toEqual(["homepage"]);
  });

  it("refuses a page size that is not one", () => {
    globalThis.localStorage.setItem("perch.table./admin/people", '{"perPage":-4}');
    expect(remembered("/admin/people").perPage).toBeUndefined();

    globalThis.localStorage.setItem("perch.table./admin/people", '{"perPage":2.5}');
    expect(remembered("/admin/people").perPage).toBeUndefined();
  });
});

describe("storage that will not have it", () => {
  it("forgets rather than throwing when writing is refused", () => {
    // Safari's private mode has the object and throws on write, so the only
    // honest test of it is a write.
    vi.spyOn(globalThis.Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });

    expect(() => {
      remember("/admin/people", { perPage: 50 });
    }).not.toThrow();
    expect(remembered("/admin/people")).toEqual({});
  });

  it("forgets rather than throwing when the quota is reached", () => {
    // The case the probe write cannot find: storage takes a one-byte test and
    // refuses the arrangement. Only the second write throws, and it is the one
    // that matters.
    const held = new Map<string, string>();
    vi.spyOn(globalThis.Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        if (key.endsWith("probe")) {
          held.set(key, value);
          return;
        }
        throw new Error("quota");
      },
    );
    vi.spyOn(globalThis.Storage.prototype, "removeItem").mockImplementation(
      (key: string) => {
        held.delete(key);
      },
    );

    expect(() => {
      remember("/admin/people", { perPage: 50 });
    }).not.toThrow();
  });

  it("forgets rather than throwing when reading is refused", () => {
    vi.spyOn(globalThis.Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("refused");
    });

    expect(remembered("/admin/people")).toEqual({});
  });
});
