/**
 * A column the reader may take off the table.
 *
 * A wide table is a table somebody narrows: eight columns are useful to the
 * person auditing and in the way of the person looking up a name. What is on
 * and what is off afterwards is the browser's — the server has no opinion about
 * which columns one reader keeps — so what crosses is the offer, not a state.
 *
 * The declaration alone can be wrong about one thing, and it is the one that
 * leaves a reader with nothing: a table where every column starts off opens on
 * a heading row and empty space.
 */
import { describe, expect, it } from "vitest";
import { auditTable } from "./audit.js";
import { Table, serialiseTable } from "./table.js";
import { TextColumn } from "./column.js";

const columnsOf = (table: Table) => serialiseTable(table).columns;

describe("what the browser is told", () => {
  it("is that the reader may take it off", () => {
    const [column] = columnsOf(
      Table.make().columns([TextColumn.make("title").toggleable()]),
    );

    expect(column?.toggleable).toBe(true);
    expect(column?.hiddenByDefault).toBeUndefined();
  });

  it("is also whether it starts off, where it does", () => {
    const [column] = columnsOf(
      Table.make().columns([TextColumn.make("createdAt").toggleable(true)]),
    );

    expect(column?.toggleable).toBe(true);
    expect(column?.hiddenByDefault).toBe(true);
  });

  it("is nothing at all for a column nobody may take off", () => {
    const [column] = columnsOf(Table.make().columns([TextColumn.make("title")]));

    expect(column?.toggleable).toBeUndefined();
    expect(column?.hiddenByDefault).toBeUndefined();
  });
});

describe("what the boot refuses", () => {
  it("a table whose every column starts off", () => {
    // It opens on a heading row with nothing under it, and the way back is a
    // menu the reader has to know is there.
    const complaints = auditTable(
      Table.make().columns([
        TextColumn.make("title").toggleable(true),
        TextColumn.make("createdAt").toggleable(true),
      ]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("one column has to stay")]);
  });

  it("says nothing where one stays", () => {
    expect(
      auditTable(
        Table.make().columns([
          TextColumn.make("title"),
          TextColumn.make("createdAt").toggleable(true),
        ]),
      ),
    ).toEqual([]);
  });

  it("says nothing about a table with no columns, which is another complaint", () => {
    // Refused elsewhere and worded for what it is. Two sentences about one
    // mistake is one sentence too many.
    const complaints = auditTable(Table.make().columns([])).map((one) => one.problem);
    // `toContain` compares by equality, so a matcher passed to it never matches
    // and the assertion holds whatever the array says. Asked directly instead.
    expect(complaints.some((one) => one.includes("one column has to stay"))).toBe(
      false,
    );
  });
});

describe("the builder", () => {
  it("does not change the column it was called on", () => {
    const before = TextColumn.make("title");
    const after = before.toggleable(true);

    expect(before.state.toggleable).toBeUndefined();
    expect(after.state.toggleable).toEqual({ hiddenByDefault: true });
  });
});
