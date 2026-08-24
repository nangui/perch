/**
 * A filter is the promise that only a value comes from outside. These are the
 * cases where that promise is kept or broken.
 */
import { describe, expect, it } from "vitest";
import { SelectFilter, TextFilter } from "./filter.js";

describe("what a value becomes", () => {
  it("is a clause naming the path and the comparison the filter declared", () => {
    expect(TextFilter.make("title").clauses("ada")[0]).toEqual({
      path: "title",
      operator: "contains",
      value: "ada",
    });
  });

  it("filters a column it was not named after, when told to", () => {
    // A filter called `author` reaching `author.name`.
    expect(
      TextFilter.make("author").path("author.name").clauses("ada")[0],
    ).toMatchObject({
      path: "author.name",
    });
  });

  it("matches the whole value when asked to be exact", () => {
    expect(TextFilter.make("slug").exact().clauses("ada")[0]).toMatchObject({
      operator: "equals",
    });
  });

  it("is nothing at all when the value is blank", () => {
    // Different from matching nothing: a blank control is a control nobody
    // used, and a clause built from it would hide every row.
    expect(TextFilter.make("title").clauses("")[0]).toBeUndefined();
    expect(TextFilter.make("title").clauses("   ")[0]).toBeUndefined();
  });

  it("takes only the value from outside, whatever the value says", () => {
    // The path and the comparison are the declaration's, and nothing a caller
    // writes reaches them.
    const clause = TextFilter.make("title").clauses("author.email")[0];

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

describe("a choice among declared values", () => {
  const status = SelectFilter.make("status").options({
    draft: "Draft",
    published: "Published",
  });

  it("answers to a value it declared", () => {
    expect(status.clauses("draft")[0]).toEqual({
      path: "status",
      operator: "equals",
      value: "draft",
    });
  });

  it("answers to nothing else", () => {
    // The closed set is the point. Without it `filter.status=<anything>` asks
    // whether a row exists with that value in that column, one guess at a time.
    expect(status.clauses("secret")[0]).toBeUndefined();
    expect(status.clauses("")[0]).toBeUndefined();
  });

  it("sends the declared value, not the string that arrived", () => {
    // A URL carries `1`; an Int column holds the number. Compared as a string
    // it matches nothing, which reads as an empty table rather than a bug.
    const country = SelectFilter.make("country").options([
      { value: 1, label: "France" },
      { value: 2, label: "Belgium" },
    ]);

    expect(country.clauses("1")[0]).toEqual({
      path: "country",
      operator: "equals",
      value: 1,
    });
  });

  it("filters a column it was not named after, when told to", () => {
    const filter = SelectFilter.make("author")
      .path("author.id")
      .options([{ value: 7, label: "Ada" }]);

    expect(filter.clauses("7")[0]).toMatchObject({ path: "author.id" });
  });

  it("keeps its choices through a clone", () => {
    // Every fluent method clones, and a clone that forgot them would answer to
    // nothing at all.
    expect(status.label("Status").clauses("draft")[0]).toBeDefined();
    expect(status.path("state").clauses("draft")[0]).toMatchObject({ path: "state" });
  });

  it("answers to nothing before it has any", () => {
    expect(SelectFilter.make("status").clauses("draft")[0]).toBeUndefined();
  });
});
