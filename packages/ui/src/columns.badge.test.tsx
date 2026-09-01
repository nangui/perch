/**
 * @vitest-environment jsdom
 *
 * The cell that draws a state rather than a word.
 *
 * Asked through the table, because a cell renderer is a plain function the
 * table calls — reaching for it directly would test something nothing runs.
 *
 * The rows are typed as what the server settled, so a change to the shape
 * `BadgeColumn.present` returns fails this file at the compiler rather than
 * leaving it agreeing with a producer it no longer matches.
 */
import type { BadgedValue, ColumnNode, ColumnTree, Row } from "@perchjs/core";
import { cleanup, render } from "@testing-library/react";
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

const COLUMN: ColumnNode = { type: "BadgeColumn", path: "status" };

function draw(...statuses: readonly unknown[]): HTMLElement {
  const columns: ColumnTree = {
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
    columns: [COLUMN],
  };
  const rows: readonly Row[] = statuses.map((status, at) => ({ id: at, status }));
  return render(<DataTable columns={columns} rows={rows} caption="People" />).container;
}

/** A value as the server hands it over. */
function judged(value: unknown, tone: BadgedValue["tone"]): BadgedValue {
  return { value, tone };
}

describe("a cell that draws a state", () => {
  it("wears the tone the server judged it to carry", () => {
    const container = draw(judged("active", "success"), judged("suspended", "danger"));
    const badges = [...container.querySelectorAll(".perch-badge")];

    expect(badges.map((badge) => badge.className)).toEqual([
      "perch-badge perch-badge--success",
      "perch-badge perch-badge--danger",
    ]);
    expect(badges.map((badge) => badge.textContent)).toEqual(["active", "suspended"]);
  });

  it("draws a value nobody judged, rather than refusing it", () => {
    // A row silent at the column's path never reaches `present`, so the bare
    // value is what a cell gets — the live path, not a precaution.
    const container = draw("invited");

    expect(container.querySelector(".perch-badge")?.className).toBe(
      "perch-badge perch-badge--neutral",
    );
    expect(container.querySelector(".perch-badge")?.textContent).toBe("invited");
  });

  it("shows the dash a table uses, rather than an empty badge", () => {
    // A coloured box around nothing says a field is blank more loudly than the
    // fact deserves, and it says it in the colour of a status.
    for (const empty of [judged("", "success"), judged(null, "danger"), undefined]) {
      const container = draw(empty);

      expect(container.querySelector(".perch-badge")).toBeNull();
      expect(container.querySelector("tbody td")?.textContent).toBe("—");
      cleanup();
    }
  });
});
