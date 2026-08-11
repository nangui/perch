/**
 * The read half of the trust boundary. Every case here is a query string, which
 * is to say something an attacker writes.
 */
import { describe, expect, it } from "vitest";
import type { FieldMeta, Ir, ModelMeta } from "@perchjs/core";
import { Table, TextColumn, TextFilter } from "@perchjs/core";
import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MAX_TERM,
  MAX_SKIP,
  readQuery,
} from "./records-query.js";

function field(name: string, over: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name,
    kind: "scalar",
    type: "String",
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefault: false,
    isLongText: false,
    ...over,
  };
}

const USER: ModelMeta = {
  name: "User",
  dbName: "users",
  primaryKey: field("id", { type: "Int", isId: true, isUnique: true }),
  fields: [
    field("id", { type: "Int", isId: true, isUnique: true }),
    field("name"),
    field("passwordHash"),
  ],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "name",
};

const IR: Ir = { models: [USER] };
const read = (raw: Record<string, unknown>) => readQuery("User", IR, raw);

describe("paging", () => {
  it("starts at the first page with a default size", () => {
    expect(read({})).toMatchObject({ skip: 0, take: DEFAULT_PER_PAGE });
  });

  it("turns a page number into an offset", () => {
    expect(read({ page: "3", perPage: "10" })).toMatchObject({ skip: 20, take: 10 });
  });

  it("caps the page size", () => {
    // Without the ceiling, `perPage=1000000` is a denial of service with a URL.
    expect(read({ perPage: "1000000" }).take).toBe(MAX_PER_PAGE);
  });

  it("refuses to go below the first page or below one row", () => {
    expect(read({ page: "-4", perPage: "0" })).toMatchObject({ skip: 0, take: 1 });
  });

  it("stops paging before the offset becomes the attack", () => {
    // `perPage` was capped and `page` was not, which left the same denial of
    // service one parameter to the left: an OFFSET is walked, not jumped to.
    expect(read({ page: "999999999", perPage: "100" }).skip).toBe(MAX_SKIP);
    expect(read({ page: "101", perPage: "100" }).skip).toBe(MAX_SKIP);
    expect(read({ page: "100", perPage: "100" }).skip).toBe(9900);
  });

  it("stops on a page boundary, so the page it served can be asked for again", () => {
    // Capping the offset instead left it mid-page: perPage=30 stopped at 10000,
    // which is no page first row, and the page the answer reported came back
    // with different rows.
    for (const perPage of [7, 25, 30, 100]) {
      const skip = read({ page: "999999", perPage: String(perPage) }).skip ?? 0;

      expect(skip % perPage).toBe(0);
      expect(skip).toBeLessThanOrEqual(MAX_SKIP);
      expect(
        read({ page: String(skip / perPage + 1), perPage: String(perPage) }).skip,
      ).toBe(skip);
    }
  });

  it("ignores what is not a whole number", () => {
    for (const bad of ["abc", "1.5", "1e9999", "", ["2"], null]) {
      expect(read({ page: bad, perPage: bad })).toMatchObject({
        skip: 0,
        take: DEFAULT_PER_PAGE,
      });
    }
  });
});

describe("sorting", () => {
  it("sorts by the key and by the label", () => {
    expect(read({ sort: "id" }).sort).toEqual([{ path: "id", direction: "asc" }]);
    expect(read({ sort: "name:desc" }).sort).toEqual([
      { path: "name", direction: "desc" },
    ]);
  });

  it("drops any other column, without a word", () => {
    // Ordering by a column reveals the order of its values, and paging turns
    // that into a search: sort by the hash, walk the pages, narrow it down.
    // Silence rather than an error, so the refusal names no field.
    expect(read({ sort: "passwordHash" }).sort).toBeUndefined();
    expect(read({ sort: "passwordHash:desc" }).sort).toBeUndefined();
  });

  it("drops a path that reaches through a relation", () => {
    expect(read({ sort: "author.passwordHash" }).sort).toBeUndefined();
  });

  it("drops a field the model does not have", () => {
    expect(read({ sort: "nope" }).sort).toBeUndefined();
  });

  it("reads an unknown direction as ascending rather than passing it on", () => {
    expect(read({ sort: "id:; DROP TABLE" }).sort).toEqual([
      { path: "id", direction: "asc" },
    ]);
  });
});

describe("searching and filtering", () => {
  it("reaches the label when no table says otherwise", () => {
    // The one field a human reads the row by, which the caller already has.
    expect(read({ search: "ada" }).search).toEqual({
      term: "ada",
      paths: [USER.labelField],
    });
  });

  it("reaches exactly the columns a table declared", () => {
    const table = Table.make().columns([
      TextColumn.make("name").searchable(),
      TextColumn.make("email").searchable(),
      // Declared, displayed, and not searchable: a column is one or the other
      // only if it says so.
      TextColumn.make("role"),
    ]);

    expect(readQuery("User", IR, { search: "ada" }, table).search).toEqual({
      term: "ada",
      paths: ["name", "email"],
    });
  });

  it("searches nothing when a table declares nothing searchable", () => {
    // Not everything: a table that named its columns and asked for no search
    // is a table that asked for no search.
    const table = Table.make().columns([TextColumn.make("name").sortable()]);

    expect(readQuery("User", IR, { search: "ada" }, table).search).toBeUndefined();
  });

  it("caps how long a term may be", () => {
    // The third parameter with the shape `perPage` and `page` were capped for:
    // an ILIKE pattern is compared against every row, and the comparison costs
    // what the pattern is long. Truncated rather than dropped, because dropping
    // it returns every row.
    const term = read({ search: "a".repeat(5000) }).search;

    expect(term?.term).toHaveLength(MAX_TERM);
  });

  it("treats an empty search as no search", () => {
    expect(read({ search: "" }).search).toBeUndefined();
  });

  it("turns a declared filter's value into a clause", () => {
    const table = Table.make().filters([TextFilter.make("title")]);

    expect(readQuery("User", IR, { "filter.title": "ada" }, table).clauses).toEqual([
      { path: "title", operator: "contains", value: "ada" },
    ]);
  });

  it("drops a name nothing declared, without a word", () => {
    // Like a sort on an undeclared column: an error would say which filters
    // exist.
    const table = Table.make().filters([TextFilter.make("title")]);

    expect(
      readQuery("User", IR, { "filter.passwordHash": "a" }, table).clauses,
    ).toBeUndefined();
  });

  it("accepts no filter at all from a resource with no table", () => {
    expect(read({ "filter.title": "ada" }).clauses).toBeUndefined();
  });

  it("caps a filter's value like a search term", () => {
    const table = Table.make().filters([TextFilter.make("title")]);
    const [clause] =
      readQuery("User", IR, { "filter.title": "a".repeat(5000) }, table).clauses ?? [];

    expect(String(clause?.value)).toHaveLength(MAX_TERM);
  });

  it("never builds a filter from the query string", () => {
    // A filter is a clause a resource declares. One that arrives from a URL and
    // reaches `where` untouched is an injection wearing the name of a feature.
    const query = read({
      filters: JSON.stringify([
        { path: "passwordHash", operator: "contains", value: "a" },
      ]),
    });

    expect(query.clauses).toBeUndefined();
  });

  it("never builds an include from the query string", () => {
    // The loading plan comes from the server's schema. Until a column declares
    // what it reaches, no relation is loaded at all.
    expect(read({ include: "author" }).include).toBeUndefined();
  });
});

describe("a model the schema does not have", () => {
  it("still pages, and sorts by nothing", () => {
    const query = readQuery("Ghost", IR, { sort: "id" });

    expect(query).toMatchObject({ model: "Ghost", skip: 0 });
    expect(query.sort).toBeUndefined();
  });
});
