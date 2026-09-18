/**
 * A column that works its value out from the row.
 *
 * For the value a row implies and does not hold: a full name from two columns,
 * a word for a pair of flags. It runs once per row, which is the cost the
 * declaration carries and the reason it is synchronous: made to await, it
 * would be a query per row on a page that is otherwise one query.
 *
 * Before the projection rather than after, so a resolver reads the row the
 * database gave and only what it returns leaves the server.
 */
import { describe, expect, it } from "vitest";
import { auditTable } from "./audit.js";
import { TextColumn, TextInputColumn } from "./column.js";
import { computedRows, serialiseTable, Table } from "./table.js";

const ROWS = [{ id: 1, firstName: "Ada", lastName: "Lovelace", secret: "kept" }];

const problems = (column: TextColumn): readonly string[] =>
  auditTable(Table.make().columns([column])).map((one) => one.problem);

describe("a computed column", () => {
  it("puts what the resolver returned at its own name", () => {
    const table = Table.make().columns([
      TextColumn.make("fullName").value(
        (row) => `${String(row["firstName"])} ${String(row["lastName"])}`,
      ),
    ]);

    expect(computedRows(ROWS, table)[0]?.["fullName"]).toBe("Ada Lovelace");
  });

  it("reads the row as the database gave it, columns nobody shows included", () => {
    // Which is why it runs before the projection. A resolver handed a row that
    // had already been cut down would see nothing it did not itself declare.
    const table = Table.make().columns([
      TextColumn.make("clue").value((row) => String(row["secret"]).toUpperCase()),
    ]);

    expect(computedRows(ROWS, table)[0]?.["clue"]).toBe("KEPT");
  });

  it("leaves every other row untouched where no column computes", () => {
    const table = Table.make().columns([TextColumn.make("firstName")]);

    expect(computedRows(ROWS, table)).toBe(ROWS);
  });
});

describe("what a computed column may not also be", () => {
  it("is ordered by, because the query has only what the model has", () => {
    // The adapter would raise, and nothing in the panel would say why. Refused
    // where it is declared instead.
    const found = problems(
      TextColumn.make("fullName")
        .value(() => "x")
        .sortable(),
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("sortable");
  });

  it("is searched, for the same reason", () => {
    expect(
      problems(
        TextColumn.make("fullName")
          .value(() => "x")
          .searchable(),
      )[0],
    ).toContain("searchable");
  });

  it("is written from the table", () => {
    // A control over a computed value is a control whose writes vanish: the
    // save lands and the cell draws what the resolver says again, so the
    // reader watches their typing undo itself with nothing to explain it.
    const found = auditTable(
      Table.make().columns([TextInputColumn.make("band").value(() => "x")]),
    ).map((one) => one.problem);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("nobody sees");
  });

  it("is named by a path through a relation", () => {
    // There would be nowhere to put what it returns: a computed column owns
    // the name it is read by.
    expect(problems(TextColumn.make("author.name").value(() => "x"))[0]).toContain(
      "computed column owns",
    );
  });

  it("is refused for none of that where it computes nothing", () => {
    expect(problems(TextColumn.make("author.name").sortable().searchable())).toEqual(
      [],
    );
  });
});

describe("what a computed column sends", () => {
  it("is the value, and not the row it read", () => {
    // The projection keeps the paths the columns declare, and a computed
    // column declares one: the name it is read by. A resolver reading `secret`
    // does not put `secret` on the wire by reading it.
    const column = TextColumn.make("clue").value((row) =>
      String(row["secret"]).toUpperCase(),
    );

    expect([...column.paths]).toEqual(["clue"]);
    expect(serialiseTable(Table.make().columns([column])).columns[0]?.path).toBe(
      "clue",
    );
  });
});
