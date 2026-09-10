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
  bulkActions: [],
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
  const withEdit: ColumnTree = {
    ...COLUMNS,
    actions: [{ type: "EditAction", name: "EditAction", trigger: "link" }],
  };

  it("renders a link, not a button", () => {
    // `EditAction` is navigation. An anchor is what lets a browser open it in a
    // new tab or copy its address.
    render(
      <DataTable
        columns={withEdit}
        rows={ROWS}
        caption="Posts"
        rowHref={(_action, row) => `/admin/posts/${String(row["id"])}/edit`}
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
        columns={{
          ...COLUMNS,
          actions: [
            { type: "SomeFutureAction", name: "SomeFutureAction", trigger: "run" },
          ],
        }}
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

describe("flat rendering, which is non-negotiable", () => {
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

  it("hands the renderer the value, the row, the column and the cell", () => {
    resetColumnRegistry();
    const render_ = vi.fn(() => "x");
    registerColumn("TextColumn", render_);
    registerColumn("IconColumn", render_);

    table();

    // A renderer holds nothing, so what a cell needs to remember — whether it
    // is waiting, and how to ask for a new value — is handed to it.
    expect(render_).toHaveBeenCalledWith("Ada", ROWS[0], COLUMNS.columns[0], {
      pending: false,
      // What the row is called, read from the first text column rather than
      // from the row: a projected row carries an address as readily as a name.
      rowName: "Ada",
    });
  });

  it("offers no way to write where the host would not carry one out", () => {
    // The column says this reader may; the host says nobody would. Either
    // missing is a control that does nothing when pressed.
    resetColumnRegistry();
    const render_ = vi.fn(() => "x");
    registerColumn("ToggleColumn", render_);
    render(
      <DataTable
        columns={{
          ...COLUMNS,
          columns: [{ type: "ToggleColumn", path: "published", editable: true }],
        }}
        rows={ROWS}
        caption="Posts"
      />,
    );

    const handed = render_.mock.calls[0] as unknown as readonly unknown[];
    expect(handed[3]).toEqual({ pending: false });
  });
});

describe("the row menu, once something has been pressed", () => {
  it("folds itself before whatever it opened", () => {
    // A `<details>` stays open on its own, so the menu sat above the dimmed
    // page behind the dialog it had just opened: a list of things to press,
    // over a modal that had taken the focus away from all of them.
    const onAction = vi.fn();
    const { container } = render(
      <DataTable
        columns={{
          ...COLUMNS,
          actions: [{ type: "ArchiveAction", name: "ArchiveAction", trigger: "run" }],
        }}
        rows={ROWS}
        caption="Posts"
        onAction={onAction}
      />,
    );

    const menu = container.querySelector("details") as HTMLDetailsElement;
    fireEvent.click(container.querySelectorAll("summary")[0] as HTMLElement);
    fireEvent.click(screen.getAllByText("Archive")[0] as HTMLElement);

    expect(menu.open).toBe(false);
    expect(onAction).toHaveBeenCalled();
  });
});

describe("a group of actions in a row's menu", () => {
  const grouped = {
    ...COLUMNS,
    actions: [
      { type: "EditAction", name: "EditAction", trigger: "link" as const },
      {
        type: "ActionGroup",
        name: "Recovery",
        label: "Recovery",
        icon: "restore",
        trigger: "group" as const,
        children: [
          { type: "RestoreAction", name: "RestoreAction", trigger: "run" as const },
          {
            type: "ForceDeleteAction",
            name: "ForceDeleteAction",
            trigger: "run" as const,
            danger: true as const,
          },
        ],
      },
    ],
  };

  it("is a section inside the menu, not a menu inside it", () => {
    // A dropdown opening out of a dropdown is a shape a pointer loses and a
    // keyboard cannot follow.
    const { container } = render(
      <DataTable
        columns={grouped}
        rows={ROWS}
        caption="Posts"
        onAction={vi.fn()}
        rowHref={(_action, row) => `/admin/posts/${String(row["id"])}/edit`}
      />,
    );

    const section = container.querySelector(".perch-table__action-group");
    expect(section?.getAttribute("role")).toBe("group");
    expect(section?.getAttribute("aria-label")).toBe("Recovery");
    // One `<details>` on the row, which is the menu itself.
    expect(container.querySelectorAll("tbody details")).toHaveLength(ROWS.length);
  });

  it("draws the shape its mark names, beside the group's own label", () => {
    // A name and not a character: the arrow that used to sit here was whatever
    // the reader's font had for `↩`, in a menu where every other mark is drawn.
    const { container } = render(
      <DataTable
        columns={grouped}
        rows={ROWS}
        caption="Posts"
        onAction={vi.fn()}
        rowHref={(_action, row) => `/admin/posts/${String(row["id"])}/edit`}
      />,
    );

    const heading = container.querySelector(".perch-table__action-group-label");
    const mark = heading?.querySelector(".perch-table__action-group-icon");

    expect(mark?.tagName.toLowerCase()).toBe("svg");
    // The label still carries the meaning; the heading reads as its words.
    expect(heading?.textContent).toBe("Recovery");
  });

  it("puts what it holds inside it, and the rest outside", () => {
    const { container } = render(
      <DataTable
        columns={grouped}
        rows={ROWS}
        caption="Posts"
        onAction={vi.fn()}
        rowHref={(_action, row) => `/admin/posts/${String(row["id"])}/edit`}
      />,
    );

    const section = container.querySelector(".perch-table__action-group");
    expect(
      [...(section?.querySelectorAll("button") ?? [])].map((b) => b.textContent),
    ).toEqual(["Restore", "Force delete"]);
    expect(section?.textContent).not.toContain("Edit");
  });

  it("runs what was pressed, not the group", () => {
    // A group has nothing behind it. Pressing one of its items is pressing
    // that item, and the route never hears the group's name.
    const onAction = vi.fn();
    const { container } = render(
      <DataTable
        columns={grouped}
        rows={ROWS}
        caption="Posts"
        onAction={onAction}
        rowHref={() => undefined}
      />,
    );

    fireEvent.click(
      container.querySelector(".perch-table__action-group button") as HTMLElement,
    );

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "RestoreAction" }),
      expect.anything(),
    );
  });

  it("draws nothing where everything in it was skipped", () => {
    // A group holding only links nothing can address is an empty heading.
    const { container } = render(
      <DataTable
        columns={{
          ...COLUMNS,
          actions: [
            {
              type: "ActionGroup",
              name: "Recovery",
              trigger: "group" as const,
              children: [
                { type: "EditAction", name: "EditAction", trigger: "link" as const },
              ],
            },
          ],
        }}
        rows={ROWS}
        caption="Posts"
      />,
    );

    expect(container.querySelector(".perch-table__action-group")).toBeNull();
  });
});
