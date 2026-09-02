/**
 * What a gauge column tells the client, and what it keeps.
 *
 * The ends of the scale cross the wire because the length is worked out where
 * the bar is drawn — that is arithmetic on a value the server already settled,
 * not a rule and not state. A column that declared ends and did not send them
 * would draw every bar against nought and a hundred without saying so.
 */
import { describe, expect, it } from "vitest";
import type { Column } from "./column.js";
import { GaugeColumn } from "./column.js";
import { presentRows, serialiseTable, Table } from "./table.js";

function table(...columns: readonly Column[]): Table {
  return Table.make().columns([...columns]);
}

describe("a column drawing a number as a length", () => {
  it("sends the ends it was given", () => {
    const payload = serialiseTable(
      table(GaugeColumn.make("rating").label("Rating").range(0, 5).sortable()),
    );

    expect(payload.columns[0]).toEqual({
      type: "GaugeColumn",
      path: "rating",
      label: "Rating",
      sortable: true,
      min: 0,
      max: 5,
    });
  });

  it("says nothing about ends nobody declared", () => {
    // Absent rather than nought and a hundred: the client's default is written
    // in one place, and a column repeating it is a second place to change it.
    expect(serialiseTable(table(GaugeColumn.make("rating"))).columns[0]).toEqual({
      type: "GaugeColumn",
      path: "rating",
    });
  });

  it("takes both ends together or neither", () => {
    // One end is a bar whose length nobody can defend, and a single method
    // taking both is what stops one being declared without the other.
    const declared = GaugeColumn.make("rating").range(2, 8).state;

    expect([declared.min, declared.max]).toEqual([2, 8]);
  });

  it("hands the number over untouched", () => {
    // Nothing to judge: a number is not an address and not a meaning, so this
    // column has no `present` of its own and the row goes through as it came.
    const rows = [{ id: 1, rating: 4 }];

    expect(presentRows(rows, table(GaugeColumn.make("rating").range(0, 5)))).toEqual(
      rows,
    );
  });

  it("reads one path, like every column but the one that draws a person", () => {
    expect(GaugeColumn.make("rating").paths).toEqual(["rating"]);
  });
});
