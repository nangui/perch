/**
 * A filter is the promise that only a value comes from outside. These are the
 * cases where that promise is kept or broken.
 */
import { describe, expect, it } from "vitest";
import { TextFilter } from "./filter.js";

describe("what a value becomes", () => {
  it("is a clause naming the path and the comparison the filter declared", () => {
    expect(TextFilter.make("title").clause("ada")).toEqual({
      path: "title",
      operator: "contains",
      value: "ada",
    });
  });

  it("filters a column it was not named after, when told to", () => {
    // A filter called `author` reaching `author.name`.
    expect(TextFilter.make("author").path("author.name").clause("ada")).toMatchObject({
      path: "author.name",
    });
  });

  it("matches the whole value when asked to be exact", () => {
    expect(TextFilter.make("slug").exact().clause("ada")).toMatchObject({
      operator: "equals",
    });
  });

  it("is nothing at all when the value is blank", () => {
    // Different from matching nothing: a blank control is a control nobody
    // used, and a clause built from it would hide every row.
    expect(TextFilter.make("title").clause("")).toBeUndefined();
    expect(TextFilter.make("title").clause("   ")).toBeUndefined();
  });

  it("takes only the value from outside, whatever the value says", () => {
    // The path and the comparison are the declaration's, and nothing a caller
    // writes reaches them.
    const clause = TextFilter.make("title").clause("author.email");

    expect(clause).toEqual({
      path: "title",
      operator: "contains",
      value: "author.email",
    });
  });
});

describe("building one", () => {
  it("clones rather than mutating, like every other builder here", () => {
    const base = TextFilter.make("title");
    const exact = base.exact();

    expect(base.state.operator).toBe("contains");
    expect(exact.state.operator).toBe("equals");
    expect(exact).not.toBe(base);
  });

  it("keys the renderer registry by a declared type", () => {
    expect(TextFilter.make("title").type).toBe("TextFilter");
  });
});
