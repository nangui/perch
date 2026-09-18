/**
 * @vitest-environment jsdom
 *
 * What a column says about the room it takes.
 *
 * Three declarations a column was specified to carry and did not have: which
 * edge the values sit against, how wide the column asks to be, and whether it
 * is one of the ones a narrow window can do without.
 *
 * The last is a layout decision and not a permission, which is the line worth
 * holding: the value is still read, still sent and still there for a wider
 * window. `visible()` is the one that keeps a value from a reader, and a test
 * below says the two are not the same thing.
 *
 * What the stylesheet promises about these lives in `narrow-layout.test.ts`,
 * which reads it as text. This file is rendered, and jsdom computes no layout,
 * so it would vouch for any rule at all.
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

const drawn = (column: TextColumn): HTMLElement => {
  const tree: ColumnTree = serialiseTable(Table.make().columns([column]));
  const row: Row = { id: 1, at: "1234" };
  return render(<DataTable columns={tree} rows={[row]} caption="Rows" />).container;
};

describe("a column that says which edge its values sit against", () => {
  it("says it on the heading and on the cells", () => {
    const table = drawn(TextColumn.make("at").alignment("end"));

    expect(table.querySelector("th")?.className).toContain("perch-table__head--end");
    expect(table.querySelector("tbody td")?.className).toContain(
      "perch-table__cell--end",
    );
  });

  it("says nothing where nothing was declared", () => {
    expect(drawn(TextColumn.make("at")).querySelector("th")?.className).toBe(
      "perch-table__head",
    );
  });
});

describe("a column with nothing to show", () => {
  const drawnWith = (column: TextColumn, row: Row): string => {
    const tree: ColumnTree = serialiseTable(Table.make().columns([column]));
    return (
      render(
        <DataTable columns={tree} rows={[row]} caption="Rows" />,
      ).container.querySelector("tbody td")?.textContent ?? ""
    );
  };

  it("draws a dash where the column said nothing", () => {
    expect(drawnWith(TextColumn.make("at"), { id: 1 })).toBe("\u2014");
  });

  it("reads the words a column put there instead", () => {
    // `Never signed in` reads as a fact. A dash reads as a gap somebody should
    // worry about, which is a different thing to say about the same row.
    expect(
      drawnWith(TextColumn.make("at").placeholder("Never signed in"), { id: 1 }),
    ).toBe("Never signed in");
  });

  it("stands a default in as a value, and formats it like one", () => {
    // The difference between the two. A default goes through everything a
    // stored value goes through; a placeholder is words and goes through none
    // of it.
    const drawn = drawnWith(TextColumn.make("at").numeric().default(1234), { id: 1 });

    expect(drawn).not.toBe("1234");
    expect(drawn).toContain("1");
  });

  it("prefers the default, and falls to the placeholder only after it", () => {
    expect(
      drawnWith(TextColumn.make("at").default("stood in").placeholder("nothing"), {
        id: 1,
      }),
    ).toBe("stood in");
  });

  it("leaves a value that is there alone", () => {
    expect(
      drawnWith(TextColumn.make("at").default("stood in").placeholder("nothing"), {
        id: 1,
        at: "held",
      }),
    ).toBe("held");
  });
});

describe("a column that asks for a width", () => {
  it("asks once, on the heading", () => {
    // A table divides what it has by its columns. Saying it on every cell
    // would be saying it five hundred times to no further effect.
    const table = drawn(TextColumn.make("at").width("8rem"));

    expect(table.querySelector("th")?.getAttribute("style")).toContain("8rem");
    expect(table.querySelector("tbody td")?.getAttribute("style")).toBeNull();
  });

  it("drops a width that is not a length, where it is declared", () => {
    // Measured on what the server sends rather than on the rendered attribute.
    // React drops an invalid CSS value of its own accord, so a test that only
    // looked at the page would pass with no check here at all: it would be
    // holding a dependency's behaviour and calling it ours.
    const bad = serialiseTable(
      Table.make().columns([TextColumn.make("at").width("wide; color: red")]),
    );
    const good = serialiseTable(
      Table.make().columns([TextColumn.make("at").width("8rem")]),
    );

    expect(bad.columns[0]?.width).toBeUndefined();
    expect(good.columns[0]?.width).toBe("8rem");
  });
});

describe("a column a narrow window can do without", () => {
  it("is marked for the stylesheet rather than left out of the markup", () => {
    // Which is what makes it a layout decision. The value is in the page and
    // comes back when the window is wide enough, with nothing fetched again.
    const table = drawn(TextColumn.make("at").hideWhenNarrow());

    expect(table.querySelector("th")?.className).toContain("--wide-only");
    expect(table.querySelector("tbody td")?.textContent).toBe("1234");
  });

  it("is not a permission, and the value still travels", () => {
    // The distinction this whole declaration turns on. `visible()` keeps a
    // value from a reader; this one keeps a line off a small screen.
    const tree = serialiseTable(
      Table.make().columns([TextColumn.make("at").hideWhenNarrow()]),
    );

    expect(tree.columns[0]?.hiddenWhenNarrow).toBe(true);
    expect(tree.columns).toHaveLength(1);
  });
});
