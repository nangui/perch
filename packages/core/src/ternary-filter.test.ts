/**
 * Yes, no, or either.
 *
 * The third state is the one a filter needs and a checkbox does not have: a
 * tick that means "either" is a tick nobody can read.
 */
import { describe, expect, it } from "vitest";
import { TernaryFilter } from "./filter.js";
import { TextColumn } from "./column.js";
import { serialiseTable, Table } from "./table.js";

describe("what a ternary filter narrows to", () => {
  const filter = TernaryFilter.make("published");

  it("compares against the boolean, never the word", () => {
    // A column holding `true` compared against `"yes"` finds nothing, and reads
    // as an empty table rather than as a bug.
    expect(filter.clauses("yes")[0]).toEqual({
      path: "published",
      operator: "equals",
      value: true,
    });
    expect(filter.clauses("no")[0]?.value).toBe(false);
  });

  it("narrows nothing where the reader asked for either", () => {
    expect(filter.clauses("")[0]).toBeUndefined();
  });

  it("narrows nothing for a value nobody declared", () => {
    expect(filter.clauses("maybe")[0]).toBeUndefined();
    expect(filter.clauses("true")[0]).toBeUndefined();
  });

  it("reads the column it was pointed at, not the one it is named after", () => {
    expect(TernaryFilter.make("live").path("isPublished").clauses("yes")[0]?.path).toBe(
      "isPublished",
    );
  });

  it("says nothing about which rows are read at all", () => {
    // That is one filter's question, and it is not this one.
    expect(filter.deleted("yes")).toBeUndefined();
  });
});

describe("what a ternary filter puts on the wire", () => {
  it("carries its two named states, and leaves the third to the empty choice", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TernaryFilter.make("published")]);

    expect(serialiseTable(table).filters).toEqual([
      {
        type: "TernaryFilter",
        name: "published",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
    ]);
  });
});
