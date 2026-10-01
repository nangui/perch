/**
 * @vitest-environment jsdom
 *
 * Group headers, and what the client is and is not allowed to work out.
 *
 * It reads boundaries off the rows it already has, which is the whole reason
 * the server orders the page by the group. The sizes are the server's, because
 * a group is larger than the part of it on a page. And collapsing hides rows
 * the browser already holds: no header fetches anything.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnTree, GroupCount, Row } from "@perchjs/core";
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
  groupBy: "team",
  columns: [
    { type: "TextColumn", path: "name", label: "Name" },
    { type: "TextColumn", path: "team", label: "Team" },
  ],
};

/** Ordered by the group, the way the server sends them. */
const ROWS: Row[] = [
  { id: 1, name: "Ada", team: "swifts" },
  { id: 2, name: "Grace", team: "swifts" },
  { id: 3, name: "Katherine", team: "wrens" },
  { id: 4, name: "Mei", team: null },
];

const GROUPS: readonly GroupCount[] = [
  { key: "swifts", total: 9 },
  { key: "wrens", total: 1 },
  { key: null, total: 1 },
];

function draw(over: Partial<Parameters<typeof DataTable>[0]> = {}): void {
  render(
    <DataTable columns={COLUMNS} rows={ROWS} caption="People" groups={GROUPS} {...over} />,
  );
}

const headers = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>(".perch-table__group")];

const bodyRows = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>("tbody tr")].filter(
    (one) => !one.classList.contains("perch-table__group"),
  );

describe("where a header opens", () => {
  it("opens one per run of rows holding the same value", () => {
    draw();

    expect(headers()).toHaveLength(3);
    expect(bodyRows()).toHaveLength(4);
  });

  it("opens none where the table gathers nothing", () => {
    const { groupBy, ...plain } = COLUMNS;
    void groupBy;
    draw({ columns: plain });

    expect(headers()).toHaveLength(0);
    expect(bodyRows()).toHaveLength(4);
  });

  it("does not open a second one inside a run", () => {
    // Two rows hold `swifts` and they are next to each other, which is what
    // the server's ordering is for. A header per row would mean the page was
    // not ordered by the group at all.
    draw();
    const first = headers()[0];

    expect(within(first as HTMLElement).getByText("swifts")).toBeTruthy();
    expect(headers().filter((one) => one.textContent.includes("swifts"))).toHaveLength(1);
  });

  it("spans the whole row, so the name is not squeezed into a column", () => {
    draw();

    expect(headers()[0]?.querySelector("th")?.getAttribute("colspan")).toBe("2");
  });

  it("spans the tick column too, where there is one", () => {
    draw({
      selection: {
        keyOf: (row) => row["id"] as number,
        picked: new Set<string>(),
        onPick: () => undefined,
        onPickAll: () => undefined,
      },
    });

    expect(headers()[0]?.querySelector("th")?.getAttribute("colspan")).toBe("3");
  });
});

describe("what a header says", () => {
  it("says the group's whole size, not the part of it on the page", () => {
    // Nine swifts, two of them here. A header counting the rows in front of
    // it would say two, and a reader would think the group was two.
    draw();

    expect(within(headers()[0] as HTMLElement).getByText("9 rows")).toBeTruthy();
  });

  it("counts one row as one row", () => {
    draw();

    expect(within(headers()[1] as HTMLElement).getByText("1 row")).toBeTruthy();
  });

  it("says nothing read as words rather than leaving the line blank", () => {
    // A header with an empty line above a group of rows looks like a header
    // that failed to load.
    draw();

    expect(within(headers()[2] as HTMLElement).getByText("No value")).toBeTruthy();
  });

  it("reads a boolean as yes and no", () => {
    draw({
      columns: { ...COLUMNS, groupBy: "paid" },
      rows: [
        { id: 1, name: "Ada", paid: true },
        { id: 2, name: "Grace", paid: false },
      ],
      groups: [
        { key: true, total: 1 },
        { key: false, total: 1 },
      ],
    });

    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("leaves the size out rather than inventing one it was not sent", () => {
    draw({ groups: [{ key: "swifts", total: 9 }] });

    expect(within(headers()[1] as HTMLElement).queryByText(/row/)).toBeNull();
  });
});

describe("collapsing a group", () => {
  it("is a control a keyboard reaches, and says whether it is open", () => {
    draw();
    const button = within(headers()[0] as HTMLElement).getByRole("button");

    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("hides that group's rows and leaves the others", () => {
    draw();
    fireEvent.click(within(headers()[0] as HTMLElement).getByRole("button"));

    // Two swifts gone, the other two rows still there, every header still
    // there: a collapsed group is still a group a reader can open.
    expect(bodyRows()).toHaveLength(2);
    expect(headers()).toHaveLength(3);
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Katherine")).toBeTruthy();
  });

  it("says it is shut, and opens again", () => {
    draw();
    const button = () => within(headers()[0] as HTMLElement).getByRole("button");
    fireEvent.click(button());

    expect(button().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(bodyRows()).toHaveLength(4);
  });

  it("tells the group holding nothing from a group holding the word", () => {
    // Filed by type as well as by value, or shutting one would shut both.
    draw({
      rows: [
        { id: 1, name: "Ada", team: "null" },
        { id: 2, name: "Mei", team: null },
      ],
      groups: [
        { key: "null", total: 1 },
        { key: null, total: 1 },
      ],
    });
    fireEvent.click(within(headers()[0] as HTMLElement).getByRole("button"));

    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Mei")).toBeTruthy();
  });
});
