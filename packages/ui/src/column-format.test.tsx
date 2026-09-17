/**
 * @vitest-environment jsdom
 *
 * A column that says how its value reads.
 *
 * The infolist could say it and the table could not, so the same timestamp was
 * a date on a record and an ISO string in the list of them. The demo in this
 * repository showed both, written a day apart by the same hand.
 *
 * The rule is declared on the server and applied here, because the locale is
 * the reader's: one response is read by several people and each of them is
 * owed their own date. That is why this is the same function the entry uses
 * rather than a second copy of it, and breaking it fails both.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ColumnTree, Row } from "@perchjs/core";
import { serialiseTable, Table, TextColumn } from "@perchjs/core";
import { DataTable } from "./DataTable.js";
import { registerBuiltInColumns } from "./columns.js";
import { resetColumnRegistry } from "./column-registry.js";

beforeEach(() => {
  resetColumnRegistry();
  registerBuiltInColumns();
  cleanup();
});

const drawn = (column: TextColumn, row: Row): string => {
  const tree: ColumnTree = serialiseTable(Table.make().columns([column]));
  const { container } = render(
    <DataTable columns={tree} rows={[row]} caption="Rows" />,
  );
  return container.querySelector("tbody td")?.textContent ?? "";
};

describe("a text column", () => {
  it("reads a timestamp as a date where it was told to", () => {
    const at = "2026-06-15T08:30:00.000Z";

    expect(drawn(TextColumn.make("at"), { at })).toBe(at);
    expect(drawn(TextColumn.make("at").dateTime({ timezone: "UTC" }), { at })).not.toBe(
      at,
    );
  });

  it("reads the zone it was given rather than the machine's", () => {
    // The rule is the server's precisely because it is not the browser's to
    // guess: an instant is one thing and which wall clock it is read against
    // is a decision somebody made.
    const at = "2026-06-15T23:30:00.000Z";
    const utc = drawn(TextColumn.make("at").dateTime({ timezone: "UTC" }), { at });
    const tokyo = drawn(TextColumn.make("at").dateTime({ timezone: "Asia/Tokyo" }), {
      at,
    });

    expect(utc).not.toBe(tokyo);
  });

  it("reads an amount in the currency the column declared", () => {
    const drawnAmount = drawn(TextColumn.make("total").money("EUR"), { total: 1234.5 });

    expect(drawnAmount).toContain("€");
    expect(drawnAmount).not.toBe("1234.5");
  });

  it("keeps the decimal places it was asked for", () => {
    expect(drawn(TextColumn.make("n").numeric({ decimals: 2 }), { n: 3 })).toContain(
      "3.00",
    );
  });

  it("shows the value as it stands where the rule does not fit it", () => {
    // A word under a rule that says date. Nothing formats it, and hiding it
    // would take away the one place somebody could notice the mistake.
    expect(drawn(TextColumn.make("at").dateTime(), { at: "not a date" })).toBe(
      "not a date",
    );
  });

  it("says nothing new where no rule was declared", () => {
    expect(drawn(TextColumn.make("at"), { at: "plain" })).toBe("plain");
  });
});
