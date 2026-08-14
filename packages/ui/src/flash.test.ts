/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepFlash, takeFlash } from "./flash.js";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("a message kept for the next page", () => {
  it("comes back on the other side of the navigation", () => {
    keepFlash({ title: "Person created", tone: "success" });

    expect(takeFlash()).toEqual({ title: "Person created", tone: "success" });
  });

  it("comes back once, so a reload does not repeat it", () => {
    keepFlash({ title: "Person created", tone: "success" });

    expect(takeFlash()).toBeDefined();
    expect(takeFlash()).toBeUndefined();
  });

  it("is nothing at all when nothing was kept", () => {
    expect(takeFlash()).toBeUndefined();
  });

  it("keeps the body when there is one", () => {
    keepFlash({ title: "Archived", body: "It is out of the list.", tone: "info" });

    expect(takeFlash()?.body).toBe("It is out of the list.");
  });

  it("is replaced rather than queued", () => {
    // Two saves before a page reads: the second is what just happened.
    keepFlash({ title: "First", tone: "info" });
    keepFlash({ title: "Second", tone: "info" });

    expect(takeFlash()?.title).toBe("Second");
    expect(takeFlash()).toBeUndefined();
  });
});

describe("what comes back out of storage", () => {
  it("is refused when it is not a message at all", () => {
    // Anything on the origin can write here, so this is read the way the
    // trust boundary reads a request: checked, not believed.
    sessionStorage.setItem("perch:flash", '"just a string"');

    expect(takeFlash()).toBeUndefined();
  });

  it("is refused when it is not even JSON", () => {
    sessionStorage.setItem("perch:flash", "{ not json");

    expect(takeFlash()).toBeUndefined();
  });

  it("is refused for a tone nothing renders", () => {
    sessionStorage.setItem(
      "perch:flash",
      JSON.stringify({ title: "Hello", tone: "onFire" }),
    );

    expect(takeFlash()).toBeUndefined();
  });

  it("is refused for a title that would show as an empty bar", () => {
    sessionStorage.setItem("perch:flash", JSON.stringify({ title: "", tone: "info" }));

    expect(takeFlash()).toBeUndefined();
  });

  it("drops a body that is not text rather than the whole message", () => {
    sessionStorage.setItem(
      "perch:flash",
      JSON.stringify({ title: "Hello", tone: "info", body: { nested: true } }),
    );

    expect(takeFlash()).toEqual({ title: "Hello", tone: "info" });
  });
});

describe("a runtime that will not store anything", () => {
  it("loses the message rather than the page", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => {
      keepFlash({ title: "Person created", tone: "success" });
    }).not.toThrow();
  });

  it("reads nothing rather than throwing on the way in", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    expect(takeFlash()).toBeUndefined();
  });
});
