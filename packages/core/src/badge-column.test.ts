/**
 * What a badge column settles before a row leaves the server.
 *
 * Through `presentRows` rather than by calling `present` directly, because that
 * is the only caller in production: a test that reached past it would agree
 * with a column nothing runs.
 */
import { describe, expect, it } from "vitest";
import type { Column } from "./column.js";
import { BadgeColumn, TextColumn } from "./column.js";
import { presentRows, serialiseTable, Table } from "./table.js";

function table(...columns: readonly Column[]): Table {
  return Table.make().columns([...columns]);
}

const ROWS = [
  { id: 1, status: "active" },
  { id: 2, status: "suspended" },
  { id: 3, status: "invited" },
];

describe("a column of states", () => {
  it("judges each row by the rule the resource wrote", () => {
    const shown = presentRows(
      ROWS,
      table(
        BadgeColumn.make("status").color((value) =>
          value === "active" ? "success" : value === "suspended" ? "danger" : undefined,
        ),
      ),
    );

    expect(shown).toEqual([
      { id: 1, status: { value: "active", tone: "success" } },
      { id: 2, status: { value: "suspended", tone: "danger" } },
      // Nothing came back for this one, so it takes the tone a badge has when
      // nobody said otherwise rather than none at all.
      { id: 3, status: { value: "invited", tone: "neutral" } },
    ]);
  });

  it("carries one tone for every row where one was fixed", () => {
    const shown = presentRows(ROWS, table(BadgeColumn.make("status").color("warning")));

    expect(shown.map((row) => row["status"])).toEqual([
      { value: "active", tone: "warning" },
      { value: "suspended", tone: "warning" },
      { value: "invited", tone: "warning" },
    ]);
  });

  it("still hands a cell something to draw where nothing was declared", () => {
    const shown = presentRows(ROWS, table(BadgeColumn.make("status")));

    expect(shown[0]?.["status"]).toEqual({ value: "active", tone: "neutral" });
  });

  it("says nothing about a row that has nothing at its path", () => {
    const shown = presentRows([{ id: 1 }], table(BadgeColumn.make("status")));

    // `presentAt` stops before the leaf where the key is absent, so `present`
    // is never reached and the row is handed over untouched. This is why the
    // renderer takes a bare value as well as a judged one: that path is the
    // live one, not a precaution.
    expect(shown[0]).toEqual({ id: 1 });
  });

  it("leaves the tone off the wire", () => {
    // It is a function and a per-row one; the column tree is neither. The
    // serialiser copies the keys it was asked for, and this is the check from
    // the other side — a tone on the wire would be a rule handed to the client.
    const payload = serialiseTable(
      table(BadgeColumn.make("status").color("danger"), TextColumn.make("name")),
    );

    expect(payload.columns[0]).toEqual({ type: "BadgeColumn", path: "status" });
  });
});
