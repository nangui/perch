/**
 * `authorize` is exported and the HTTP routes are not its only caller — the
 * navigation and the edit page will ask it too, and not all of them will hold a
 * record. These are the answers it gives on its own.
 */
import { describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import { authorize, mayReach } from "./authorization.js";

const admin = { admin: true };
const guest = { admin: false };
const record = { authorId: "ada" };

describe("with nothing declared", () => {
  it.each(["create", "edit", "view"] as const)("allows %s", async (operation) => {
    expect(await authorize(undefined, operation, guest)).toBe("allowed");
  });
});

describe("viewAny gates the resource", () => {
  const can: Authorization = { viewAny: (user) => (user as typeof admin).admin };

  it("denies before any operation is considered", async () => {
    expect(await authorize(can, "create", guest)).toBe("denied");
    expect(await authorize(can, "edit", guest, record)).toBe("denied");
  });

  it("falls through to the operation once it passes", async () => {
    expect(await authorize(can, "create", admin)).toBe("allowed");
  });
});

describe("a check that takes a record", () => {
  const can: Authorization = {
    update: (_user, row) => (row as typeof record).authorId === "ada",
  };

  it("cannot be answered without one", async () => {
    // The route loads a record before asking, so this branch is for the callers
    // that do not. Answering "allowed" here would let them skip the check.
    expect(await authorize(can, "edit", admin)).toBe("needs-record");
  });

  it("is answered with one", async () => {
    expect(await authorize(can, "edit", admin, record)).toBe("allowed");
    expect(await authorize(can, "edit", admin, { authorId: "grace" })).toBe("denied");
  });
});

describe("mayReach", () => {
  it("is the viewAny gate alone", async () => {
    expect(await mayReach(undefined, guest)).toBe(true);
    expect(await mayReach({ create: () => false }, guest)).toBe(true);
    expect(await mayReach({ viewAny: () => false }, guest)).toBe(false);
  });
});

describe("an asynchronous check", () => {
  it("is awaited rather than read as a truthy promise", async () => {
    const can: Authorization = { create: () => Promise.resolve(false) };

    expect(await authorize(can, "create", guest)).toBe("denied");
  });
});
