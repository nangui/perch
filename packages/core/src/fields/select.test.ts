import { describe, expect, it } from "vitest";
import { Select } from "./select.js";

describe("a multiple select", () => {
  it("holds several values", () => {
    expect(Select.make("tags").multiple().state.multiple).toBe(true);
  });

  it("refuses a relation, rather than saving one of the three you picked", () => {
    expect(() => Select.make("tagIds").relationship("tags", "name").multiple()).toThrow(
      "writing several rows of a relation is not supported yet",
    );
  });

  it("refuses it declared the other way round too", () => {
    expect(() => Select.make("tagIds").multiple().relationship("tags", "name")).toThrow(
      "writing several rows of a relation is not supported yet",
    );
  });

  it("names the field and the relation, so the line is findable", () => {
    expect(() => Select.make("tagIds").multiple().relationship("tags", "name")).toThrow(
      /`tagIds`.*`tags`/,
    );
  });

  it("allows a relation once multiple is turned back off", () => {
    expect(() =>
      Select.make("authorId").multiple().multiple(false).relationship("author", "name"),
    ).not.toThrow();
  });
});
