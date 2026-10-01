/**
 * @vitest-environment jsdom
 *
 * The footer: what a table says about a column under all of it.
 *
 * The number comes from the server, worked out over every row a filter left,
 * so nothing here computes anything. What is drawn here is how it reads: that
 * a total of a money column reads as money, that a count of that same column
 * does not, and that no value reads as no value rather than as nought.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ColumnTree, Row, Summary } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { resetColumnRegistry } from "./column-registry.js";
import { registerBuiltInColumns } from "./columns.js";
import { DataTable } from "./DataTable.js";

registerBuiltInColumns();

afterEach(() => {
  cleanup();
  resetColumnRegistry();
  registerBuiltInColumns();
});

const COLUMNS: ColumnTree = {
  actions: [],
  filters: [],
  headerActions: [],
  bulkActions: [],
  columns: [
    { type: "TextColumn", path: "name", label: "Name" },
    {
      type: "TextColumn",
      path: "owed",
      label: "Owed",
      format: "money",
      currency: "EUR",
    },
    { type: "TextColumn", path: "placedAt", label: "Placed", format: "dateTime" },
  ],
};

const ROWS: Row[] = [
  { id: 1, name: "Ada", owed: 1200, placedAt: "2026-03-04T05:06:07.000Z" },
  { id: 2, name: "Grace", owed: 800, placedAt: "2026-03-07T09:00:00.000Z" },
];

function draw(summaries?: Readonly<Record<string, readonly Summary[]>>): void {
  render(
    <DataTable
      columns={COLUMNS}
      rows={ROWS}
      caption="Orders"
      {...(summaries === undefined ? {} : { summaries })}
    />,
  );
}

const foot = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(".perch-table__foot");

describe("a table with nothing to say under it", () => {
  it("draws no footer at all", () => {
    draw();

    expect(foot()).toBeNull();
  });

  it("draws none for a payload that named no column either", () => {
    draw({});

    expect(foot()).toBeNull();
  });
});

describe("what the footer draws", () => {
  it("names each line and puts it under its own column", () => {
    draw({ owed: [{ of: "sum", value: 2000 }] });
    const row = foot()?.querySelectorAll("td");

    expect(row).toHaveLength(3);
    // Under `owed`, which is the second column, and nowhere else.
    expect(row?.[0]?.textContent).toBe("");
    expect(row?.[1]?.textContent).toContain("Total");
    expect(row?.[2]?.textContent).toBe("");
  });

  it("gives a column asking for two lines two rows, lined up under itself", () => {
    draw({
      owed: [
        { of: "sum", value: 2000 },
        { of: "avg", value: 1000 },
      ],
    });
    const rows = foot()?.querySelectorAll("tr") ?? [];

    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("Total")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Average")).toBeTruthy();
  });

  it("is as tall as the deepest column, and the shallow one leaves a gap", () => {
    draw({
      name: [{ of: "count", value: 2 }],
      owed: [
        { of: "sum", value: 2000 },
        { of: "avg", value: 1000 },
      ],
    });
    const rows = foot()?.querySelectorAll("tr") ?? [];

    expect(rows).toHaveLength(2);
    // `name` said one thing, so its cell on the second line is empty rather
    // than holding the average of a column it is not.
    expect((rows[1] as HTMLElement).querySelectorAll("td")[0]?.textContent).toBe("");
  });
});

describe("how a footer reads", () => {
  it("reads a total of money as money, by the column's own rule", () => {
    // The same call a cell makes, so a panel cannot show an amount one way in
    // a row and another under it.
    draw({ owed: [{ of: "sum", value: 2000 }] });

    expect(foot()?.textContent).toMatch(/2[\s,. ]?000/);
    expect(foot()?.textContent).toMatch(/€|EUR/);
  });

  it("does not read a count of that column as money", () => {
    // A count is a number of rows. Run through the money rule it would read
    // as an amount and mean a tally.
    draw({ owed: [{ of: "count", value: 2 }] });

    expect(foot()?.textContent).toContain("2");
    expect(foot()?.textContent).not.toMatch(/€|EUR/);
  });

  it("reads a range as two ends of the column's own kind of value", () => {
    draw({
      placedAt: [
        {
          of: "range",
          value: "2026-03-04T05:06:07.000Z",
          to: "2026-03-07T09:00:00.000Z",
        },
      ],
    });
    const said = foot()?.textContent ?? "";

    expect(said).toContain("Range");
    expect(said).toContain(" to ");
    // Formatted, not an ISO string sitting in a footer.
    expect(said).not.toContain("2026-03-04T05");
  });

  it("reads no value as no value, and never as nought", () => {
    // The lie a footer cannot take back. A sum of a column holding nothing but
    // nulls is not nought, and somebody is reading this number rather than
    // passing it on.
    draw({ owed: [{ of: "sum", value: null }] });
    const said = foot()?.textContent ?? "";

    expect(said).toContain("Total");
    expect(said).not.toContain("0");
    expect(said).toContain("–");
  });

  it("reads half a range as half missing", () => {
    draw({ owed: [{ of: "range", value: 800, to: null }] });

    expect(foot()?.textContent).toMatch(/to\s*–/);
  });
});

describe("the footer and the rest of the row", () => {
  it("leaves room for the checkbox column, so the cells stay lined up", () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        caption="Orders"
        summaries={{ owed: [{ of: "sum", value: 2000 }] }}
        selection={{
          keyOf: (row) => row["id"] as number,
          picked: new Set<string>(),
          onPick: () => undefined,
          onPickAll: () => undefined,
        }}
      />,
    );

    // Four: the tick column and the three columns. A footer one cell short
    // would put every number under the wrong heading.
    expect(foot()?.querySelectorAll("td")).toHaveLength(4);
    expect(screen.getByText("Total")).toBeTruthy();
  });
});
