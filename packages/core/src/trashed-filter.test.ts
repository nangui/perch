/**
 * The filter that decides which rows a list is reading at all.
 *
 * Not a clause. Deletion is not a column a narrowing can name: a marked row is
 * left out by the read itself, at the top level and inside every relation, so
 * asking for it back is a different question from narrowing what came out.
 */
import { describe, expect, it } from "vitest";
import { serialiseTable, Table } from "./table.js";
import { TextColumn } from "./column.js";
import { TrashedFilter } from "./filter.js";
import { auditTable } from "./audit.js";

describe("what a trashed filter answers", () => {
  const filter = TrashedFilter.make();

  it("asks for the deleted ones to be included", () => {
    expect(filter.deleted("with")).toBe("with");
  });

  it("asks for those alone", () => {
    expect(filter.deleted("only")).toBe("only");
  });

  it("says nothing for a value nobody declared", () => {
    // A closed set of three, so `filter.trashed=<anything>` is not a way to ask
    // a question nobody wrote down.
    expect(filter.deleted("everything")).toBeUndefined();
    expect(filter.deleted("")).toBeUndefined();
  });

  it("never narrows, whatever it is given", () => {
    expect(filter.clause()).toBeUndefined();
  });
});

describe("every other filter", () => {
  it("says nothing about deletion, which is one filter's to decide", () => {
    // The base answers for all of them, so a filter added later cannot start
    // deciding this by accident.
    expect(TrashedFilter.make().deleted("with")).toBe("with");
  });
});

describe("what crosses the wire", () => {
  it("carries its three states, so the client draws a control it knows", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TrashedFilter.make()]);

    expect(serialiseTable(table).filters).toEqual([
      {
        type: "TrashedFilter",
        name: "trashed",
        options: [
          { value: "with", label: "With deleted" },
          { value: "only", label: "Only deleted" },
        ],
      },
    ]);
  });
});

describe("two of them on one table", () => {
  it("stops the boot, because they decide one thing between them", () => {
    // Under one name the existing check catches it. Under two it did not, and
    // the answer was whichever was declared last — arbitrary, and invisible.
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TrashedFilter.make("a"), TrashedFilter.make("b")]);

    expect(auditTable(table)).toEqual([
      {
        field: "a, b",
        problem: expect.stringContaining("set them against each other"),
      },
    ]);
  });

  it("says nothing about one", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TrashedFilter.make()]);

    expect(auditTable(table)).toEqual([]);
  });
});

describe("a column named on a trashed filter", () => {
  it("stops the boot, because it reads no column", () => {
    // Measured before this: accepted, stored, and acted on by nothing.
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TrashedFilter.make().path("deletedAt")]);

    expect(auditTable(table)).toEqual([
      { field: "trashed", problem: expect.stringContaining("reads no column") },
    ]);
  });
});
