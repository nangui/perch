import { describe, expect, it } from "vitest";
import { IconColumn, TextColumn } from "./column.js";
import { EditAction } from "./action.js";
import { declaredFilters, serialiseTable, sortablePaths, Table } from "./table.js";
import { TextFilter } from "./filter.js";

describe("a column builder", () => {
  it("clones on every fluent call", () => {
    // Invariant 3. A builder shared between requests leaks one user's state
    // into another's, which is a security hole rather than a matter of style.
    const plain = TextColumn.make("title");
    const labelled = plain.label("Headline");
    const sortable = labelled.sortable();

    expect(plain).not.toBe(labelled);
    expect(labelled).not.toBe(sortable);
    expect(plain.state.label).toBeUndefined();
    expect(plain.state.sortable).toBe(false);
    expect(sortable.state).toMatchObject({ label: "Headline", sortable: true });
  });

  it("keeps its own type through the chain", () => {
    // The renderer registry keys on this, and a minifier would rewrite a class
    // name, so it is declared.
    expect(IconColumn.make("published").boolean().label("Live").type).toBe(
      "IconColumn",
    );
    expect(TextColumn.make("title").sortable().type).toBe("TextColumn");
  });

  it("takes sortable(false) back", () => {
    expect(TextColumn.make("title").sortable().sortable(false).state.sortable).toBe(
      false,
    );
  });
});

describe("a table", () => {
  it("clones too", () => {
    const empty = Table.make();
    const filled = empty.columns([TextColumn.make("title")]);

    expect(empty).not.toBe(filled);
    expect(empty.state.columns).toHaveLength(0);
    expect(filled.state.columns).toHaveLength(1);
  });

  it("does not share the array it was handed", () => {
    // A caller who keeps their array and pushes to it must not reshape the
    // table afterwards.
    const columns = [TextColumn.make("title")];
    const table = Table.make().columns(columns);
    columns.push(TextColumn.make("smuggled"));

    expect(table.state.columns).toHaveLength(1);
  });
});

describe("what crosses the wire", () => {
  const table = Table.make()
    .columns([
      TextColumn.make("title").label("Headline").sortable(),
      TextColumn.make("author.name"),
      IconColumn.make("published").boolean(),
    ])
    .defaultSort("title", "desc");

  it("carries the type, the path and what the client renders from", () => {
    expect(serialiseTable(table)).toEqual({
      columns: [
        { type: "TextColumn", path: "title", label: "Headline", sortable: true },
        { type: "TextColumn", path: "author.name" },
        { type: "IconColumn", path: "published", boolean: true },
      ],
      filters: [],
      actions: [],
      headerActions: [],
      defaultSort: { path: "title", direction: "desc" },
    });
  });

  it("omits what was never declared rather than sending a false", () => {
    const [, second] = serialiseTable(table).columns;

    expect(second).not.toHaveProperty("sortable");
    expect(second).not.toHaveProperty("label");
  });

  it("says whether a search reaches anything, and never which columns", () => {
    // The client renders a box from the flag. Naming the columns behind it
    // would answer a question nobody asked — which is the whole reason the
    // paths are an allowlist on the server.
    const searchable = Table.make().columns([
      TextColumn.make("title").searchable(),
      TextColumn.make("secret"),
    ]);
    const tree = serialiseTable(searchable);

    expect(tree.searchable).toBe(true);
    expect(JSON.stringify(tree)).not.toContain('searchable":true,"path');
    for (const column of tree.columns) {
      expect(column).not.toHaveProperty("searchable");
    }
  });

  it("says nothing about a search that reaches nothing", () => {
    expect(serialiseTable(table)).not.toHaveProperty("searchable");
  });

  it("says nothing at all about a table with no columns", () => {
    expect(serialiseTable(Table.make())).toEqual({
      columns: [],
      filters: [],
      actions: [],
      headerActions: [],
    });
  });

  it("carries the actions a row offers, with the label they were given", () => {
    const table = Table.make().actions([
      EditAction.make(),
      EditAction.make().label("Open"),
    ]);

    expect(serialiseTable(table).actions).toEqual([
      { type: "EditAction" },
      { type: "EditAction", label: "Open" },
    ]);
  });

  it("clones when actions are set, like everything else", () => {
    const empty = Table.make();

    expect(empty.actions([EditAction.make()])).not.toBe(empty);
    expect(empty.state.actions).toHaveLength(0);
  });
});

describe("the sortable paths", () => {
  it("is exactly the columns that asked", () => {
    const table = Table.make().columns([
      TextColumn.make("title").sortable(),
      TextColumn.make("body"),
      IconColumn.make("published").boolean().sortable(),
    ]);

    expect([...sortablePaths(table)].sort()).toEqual(["published", "title"]);
  });

  it("is empty for a table nobody made sortable", () => {
    expect(sortablePaths(Table.make().columns([TextColumn.make("title")])).size).toBe(
      0,
    );
  });
});

describe("two filters under one name", () => {
  it("says so rather than quietly dropping one", () => {
    // Which one survived would depend on the order they were written in, and
    // the other would answer nothing for the life of the panel.
    const table = Table.make().filters([
      TextFilter.make("title"),
      TextFilter.make("title").path("subtitle"),
    ]);

    expect(() => declaredFilters(table)).toThrow(/two filters are named title/);
  });

  it("is happy with two filters on one column under two names", () => {
    const table = Table.make().filters([
      TextFilter.make("headline").path("title"),
      TextFilter.make("exact").path("title").exact(),
    ]);

    expect(declaredFilters(table).size).toBe(2);
  });
});
