/**
 * @vitest-environment jsdom
 *
 * The table, and the constraint it exists to honour.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnTree, Row } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerColumn, resetColumnRegistry } from "./column-registry.js";
import { registerBuiltInColumns } from "./columns.js";
import { DataTable } from "./DataTable.js";

// Explicit, because `columns.tsx` does not register on import: the package
// declares no JavaScript side effects, so a bundler may drop a module-scope
// call. `panel.tsx` calls this for the same reason.
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
  columns: [
    { type: "TextColumn", path: "title", label: "Headline", sortable: true },
    { type: "TextColumn", path: "author.name", label: "Author" },
    { type: "IconColumn", path: "published", boolean: true },
  ],
};

const ROWS: Row[] = [
  { id: 1, title: "Ada", author: { name: "Grace" }, published: true },
  { id: 2, title: "Katherine", author: null, published: false },
];

const table = (over: Partial<Parameters<typeof DataTable>[0]> = {}) =>
  render(<DataTable columns={COLUMNS} rows={ROWS} caption="Posts" {...over} />);

describe("what a table renders", () => {
  it("puts a header per column and a row per record", () => {
    table();

    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Headline")).toBeTruthy();
  });

  it("reads a path through a relation, and shows nothing for a missing one", () => {
    table();
    const [, first, second] = screen.getAllByRole("row");

    expect(within(first!).getByText("Grace")).toBeTruthy();
    // `author` is null on the second row: an em dash, not a crash and not
    // "null". Asserting the dash too — "no cell says null" is also true of a
    // table that rendered nothing at all.
    expect(within(second!).queryByText("null")).toBeNull();
    expect(within(second!).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("says out loud what an icon only shows", () => {
    // A tick alone is a cell that reads as silence.
    table();
    const [, first, second] = screen.getAllByRole("row");

    expect(within(first!).getByText("yes")).toBeTruthy();
    expect(within(second!).getByText("no")).toBeTruthy();
  });

  it("names itself for a screen reader", () => {
    table();

    expect(screen.getByRole("table", { name: "Posts" })).toBeTruthy();
  });

  it("shows a marker for a column type nobody registered", () => {
    // Blank would read as missing data rather than as a missing renderer.
    resetColumnRegistry();
    table();

    expect(screen.getAllByTitle(/No renderer for TextColumn/)[0]).toBeTruthy();
  });

  it("shows an empty state instead of a headerless table", () => {
    table({ rows: [], empty: "No posts yet." });

    expect(screen.getByRole("status").textContent).toBe("No posts yet.");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("row actions", () => {
  const withEdit: ColumnTree = { ...COLUMNS, actions: [{ type: "EditAction" }] };

  it("renders a link, not a button", () => {
    // `EditAction` is navigation. An anchor is what lets a browser open it in a
    // new tab or copy its address.
    render(
      <DataTable
        columns={withEdit}
        rows={ROWS}
        caption="Posts"
        rowHref={(row) => `/admin/posts/${String(row["id"])}/edit`}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Edit" })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });

  it("adds no column at all when nothing can build an address", () => {
    render(<DataTable columns={withEdit} rows={ROWS} caption="Posts" />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("skips an action nobody registered a meaning for", () => {
    // Rendering an unknown action as a link would send someone somewhere the
    // server never offered.
    render(
      <DataTable
        columns={{ ...COLUMNS, actions: [{ type: "SomeFutureAction" }] }}
        rows={ROWS}
        caption="Posts"
        rowHref={() => "/somewhere"}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("sorting from the keyboard", () => {
  it("makes a sortable header a button, and a plain one not", () => {
    table({ onSort: vi.fn() });

    // Sortable headers have to be actionable from the keyboard. A click handler
    // on a `th` is not.
    expect(screen.getByRole("button", { name: /Headline/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Author/ })).toBeNull();
  });

  it("claims nothing about sorting when no control exists", () => {
    // `aria-sort="none"` on a header with no button tells a screen reader the
    // column can be reordered, and it cannot.
    table();
    const [headline] = screen.getAllByRole("columnheader");

    expect(headline?.getAttribute("aria-sort")).toBeNull();
  });

  it("announces the direction through aria-sort", () => {
    table({ onSort: vi.fn(), sort: { path: "title", direction: "desc" } });
    const [headline, author] = screen.getAllByRole("columnheader");

    expect(headline?.getAttribute("aria-sort")).toBe("descending");
    // Not sortable at all, so it makes no claim either way.
    expect(author?.getAttribute("aria-sort")).toBeNull();
  });

  it("asks for the other direction when it already sorts that way", () => {
    const onSort = vi.fn();
    table({ onSort, sort: { path: "title", direction: "asc" } });

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));
    expect(onSort).toHaveBeenCalledWith({ path: "title", direction: "desc" });
  });

  it("does not offer a control when nothing can act on it", () => {
    // `sortable` is the server's word; `onSort` is whether this table can do
    // anything with it. Both, or no button.
    table();

    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the flat rendering invariant 6 calls non-negotiable", () => {
  it("looks a renderer up once per column, not once per cell", async () => {
    // The wall Filament hit, and the assertion that actually catches it.
    // Counting render calls would not: a `<Cell>` component per cell produces
    // exactly the same six. Counting *lookups* is what tells the two apart —
    // three columns, whatever the row count.
    const registry = await import("./column-registry.js");
    const lookups = vi.spyOn(registry, "lookupColumn");

    table();

    expect(lookups).toHaveBeenCalledTimes(COLUMNS.columns.length);
    expect(ROWS.length).toBeGreaterThan(1);
    lookups.mockRestore();
  });

  it("calls the renderer once per cell", () => {
    resetColumnRegistry();
    const render_ = vi.fn(() => "x");
    registerColumn("TextColumn", render_);
    registerColumn("IconColumn", render_);

    table();

    expect(render_).toHaveBeenCalledTimes(COLUMNS.columns.length * ROWS.length);
  });

  it("hands the renderer the value, the row and the column", () => {
    resetColumnRegistry();
    const render_ = vi.fn(() => "x");
    registerColumn("TextColumn", render_);
    registerColumn("IconColumn", render_);

    table();

    expect(render_).toHaveBeenCalledWith("Ada", ROWS[0], COLUMNS.columns[0]);
  });
});
