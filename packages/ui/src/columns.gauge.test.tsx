/**
 * @vitest-environment jsdom
 *
 * The cell that draws a number as a length.
 *
 * The proportion is worked out here rather than sent, so this is where it can
 * be wrong: a value past either end of the scale, a scale of zero width, a
 * scale declared backwards. Asked through the table, because a cell renderer is
 * a plain function the table calls.
 */
import type { ColumnNode, ColumnTree, Row } from "@perchjs/core";
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

function draw(column: ColumnNode, ...values: readonly unknown[]): HTMLElement {
  const columns: ColumnTree = {
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
    columns: [column],
  };
  const rows: readonly Row[] = values.map((rating, at) => ({ id: at, rating }));
  return render(<DataTable columns={columns} rows={rows} caption="People" />).container;
}

const RATING: ColumnNode = {
  type: "GaugeColumn",
  path: "rating",
  label: "Rating",
  min: 0,
  max: 5,
};

const filled = (container: HTMLElement): readonly string[] =>
  [...container.querySelectorAll<HTMLElement>(".perch-cell__gauge-fill")].map(
    (fill) => fill.style.inlineSize,
  );

describe("a cell drawing a number as a length", () => {
  it("fills the track by where the value falls between the ends", () => {
    expect(filled(draw(RATING, 0, 1, 4, 5))).toEqual(["0%", "20%", "80%", "100%"]);
  });

  it("keeps the number beside the bar", () => {
    // A bar answers "which of these is short" and answers "how short" not at
    // all; the digits are for the reader who came for one row.
    const container = draw(RATING, 4);

    expect(container.querySelector(".perch-cell__gauge-value")?.textContent).toBe("4");
  });

  it("says the value to somebody who cannot see the length", () => {
    const meter = draw(RATING, 4).querySelector('[role="meter"]');

    expect(meter?.getAttribute("aria-valuenow")).toBe("4");
    expect(meter?.getAttribute("aria-valuemin")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("5");
    expect(meter?.getAttribute("aria-label")).toBe("Rating");
  });

  it("stops at the ends where a stored value went past them", () => {
    // A bar past the end of its own track is a row drawn outside its cell.
    expect(filled(draw(RATING, -3, 9))).toEqual(["0%", "100%"]);
  });

  it("draws nothing rather than dividing by a scale of no width", () => {
    expect(filled(draw({ ...RATING, min: 5, max: 5 }, 5))).toEqual(["0%"]);
  });

  it("counts from nought to a hundred where a column declared no ends", () => {
    expect(filled(draw({ type: "GaugeColumn", path: "rating" }, 25))).toEqual(["25%"]);
  });

  it("shows the dash a table uses where there is no length to draw", () => {
    for (const held of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const container = draw(RATING, held);

      expect(container.querySelector(".perch-cell__gauge")).toBeNull();
      expect(container.querySelector("tbody td")?.textContent).toBe("—");
      cleanup();
    }
  });

  it("says what it holds where the value is not a number at all", () => {
    // A column that cannot draw a bar can still show its value, and hiding one
    // because it arrived in the wrong shape is how a wrong value goes unnoticed.
    const container = draw(RATING, "four");

    expect(container.querySelector(".perch-cell__gauge")).toBeNull();
    expect(container.querySelector("tbody td")?.textContent).toBe("four");
  });
});
