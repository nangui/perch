/**
 * The read half of the trust boundary. Every case here is a query string, which
 * is to say something an attacker writes.
 */
import { describe, expect, it } from "vitest";
import type { Ir, ModelMeta } from "@perchjs/core";
import {
  DateRangeFilter,
  Table,
  TextColumn,
  SchemaFilter,
  Select,
  TextFilter,
  TextInput,
  TrashedFilter,
} from "@perchjs/core";
import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MAX_TERM,
  MAX_SKIP,
  readList,
} from "./records-query.js";
import { scalar } from "./__fixtures__/ir.js";

const USER: ModelMeta = {
  name: "User",
  dbName: "users",
  primaryKey: scalar("id", { type: "Int", isId: true, isUnique: true }),
  fields: [
    scalar("id", { type: "Int", isId: true, isUnique: true }),
    scalar("name"),
    scalar("passwordHash"),
  ],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "name",
};

const IR: Ir = { models: [USER] };
const read = async (raw: Record<string, unknown>) =>
  (await readList("User", IR, raw)).query;

describe("paging", () => {
  it("starts at the first page with a default size", async () => {
    expect(await read({})).toMatchObject({ skip: 0, take: DEFAULT_PER_PAGE });
  });

  it("turns a page number into an offset", async () => {
    expect(await read({ page: "3", perPage: "10" })).toMatchObject({
      skip: 20,
      take: 10,
    });
  });

  it("caps the page size", async () => {
    // Without the ceiling, `perPage=1000000` is a denial of service with a URL.
    expect((await read({ perPage: "1000000" })).take).toBe(MAX_PER_PAGE);
  });

  it("refuses to go below the first page or below one row", async () => {
    expect(await read({ page: "-4", perPage: "0" })).toMatchObject({
      skip: 0,
      take: 1,
    });
  });

  it("stops paging before the offset becomes the attack", async () => {
    // `perPage` was capped and `page` was not, which left the same denial of
    // service one parameter to the left: an OFFSET is walked, not jumped to.
    expect((await read({ page: "999999999", perPage: "100" })).skip).toBe(MAX_SKIP);
    expect((await read({ page: "101", perPage: "100" })).skip).toBe(MAX_SKIP);
    expect((await read({ page: "100", perPage: "100" })).skip).toBe(9900);
  });

  it("stops on a page boundary, so the page it served can be asked for again", async () => {
    // Capping the offset instead left it mid-page: perPage=30 stopped at 10000,
    // which is no page first row, and the page the answer reported came back
    // with different rows.
    for (const perPage of [7, 25, 30, 100]) {
      const skip = (await read({ page: "999999", perPage: String(perPage) })).skip ?? 0;

      expect(skip % perPage).toBe(0);
      expect(skip).toBeLessThanOrEqual(MAX_SKIP);
      expect(
        (await read({ page: String(skip / perPage + 1), perPage: String(perPage) }))
          .skip,
      ).toBe(skip);
    }
  });

  it("ignores what is not a whole number", async () => {
    for (const bad of ["abc", "1.5", "1e9999", "", ["2"], null]) {
      expect(await read({ page: bad, perPage: bad })).toMatchObject({
        skip: 0,
        take: DEFAULT_PER_PAGE,
      });
    }
  });
});

describe("sorting", () => {
  it("sorts by the key and by the label", async () => {
    expect((await read({ sort: "id" })).sort).toEqual([
      { path: "id", direction: "asc" },
    ]);
    expect((await read({ sort: "name:desc" })).sort).toEqual([
      { path: "name", direction: "desc" },
    ]);
  });

  it("drops any other column, without a word", async () => {
    // Ordering by a column reveals the order of its values, and paging turns
    // that into a search: sort by the hash, walk the pages, narrow it down.
    // Silence rather than an error, so the refusal names no field.
    expect((await read({ sort: "passwordHash" })).sort).toBeUndefined();
    expect((await read({ sort: "passwordHash:desc" })).sort).toBeUndefined();
  });

  it("drops a path that reaches through a relation", async () => {
    expect((await read({ sort: "author.passwordHash" })).sort).toBeUndefined();
  });

  it("drops a field the model does not have", async () => {
    expect((await read({ sort: "nope" })).sort).toBeUndefined();
  });

  it("reads an unknown direction as ascending rather than passing it on", async () => {
    expect((await read({ sort: "id:; DROP TABLE" })).sort).toEqual([
      { path: "id", direction: "asc" },
    ]);
  });
});

describe("searching and filtering", () => {
  it("reaches the label when no table says otherwise", async () => {
    // The one field a human reads the row by, which the caller already has.
    expect((await read({ search: "ada" })).search).toEqual({
      term: "ada",
      paths: [USER.labelField],
    });
  });

  it("reaches exactly the columns a table declared", async () => {
    const table = Table.make().columns([
      TextColumn.make("name").searchable(),
      TextColumn.make("email").searchable(),
      // Declared, displayed, and not searchable: a column is one or the other
      // only if it says so.
      TextColumn.make("role"),
    ]);

    expect((await readList("User", IR, { search: "ada" }, table)).query.search).toEqual(
      {
        term: "ada",
        paths: ["name", "email"],
      },
    );
  });

  it("searches nothing when a table declares nothing searchable", async () => {
    // Not everything: a table that named its columns and asked for no search
    // is a table that asked for no search.
    const table = Table.make().columns([TextColumn.make("name").sortable()]);

    expect(
      (await readList("User", IR, { search: "ada" }, table)).query.search,
    ).toBeUndefined();
  });

  it("caps how long a term may be", async () => {
    // The third parameter with the shape `perPage` and `page` were capped for:
    // an ILIKE pattern is compared against every row, and the comparison costs
    // what the pattern is long. Truncated rather than dropped, because dropping
    // it returns every row.
    const term = (await read({ search: "a".repeat(5000) })).search;

    expect(term?.term).toHaveLength(MAX_TERM);
  });

  it("treats an empty search as no search", async () => {
    expect((await read({ search: "" })).search).toBeUndefined();
  });

  it("turns a declared filter's value into a clause", async () => {
    const table = Table.make().filters([TextFilter.make("title")]);

    expect(
      (await readList("User", IR, { "filter.title": "ada" }, table)).query.clauses,
    ).toEqual([{ path: "title", operator: "contains", value: "ada" }]);
  });

  it("turns one filter's value into both ends of a range", async () => {
    // A filter is one control and not always one comparison. Collecting a
    // single clause per filter would have kept whichever end was built first
    // and shown a page half again as long as the reader asked for.
    const table = Table.make().filters([DateRangeFilter.make("createdAt")]);

    expect(
      (
        await readList(
          "User",
          IR,
          { "filter.createdAt": "2026-01-01..2026-06-30" },
          table,
        )
      ).query.clauses,
    ).toEqual([
      { path: "createdAt", operator: "gte", value: new Date("2026-01-01T00:00:00Z") },
      { path: "createdAt", operator: "lt", value: new Date("2026-07-01T00:00:00Z") },
    ]);
  });

  it("keeps a range beside the filters around it", async () => {
    const table = Table.make().filters([
      TextFilter.make("title"),
      DateRangeFilter.make("createdAt"),
    ]);

    const query = (
      await readList(
        "User",
        IR,
        { "filter.title": "ada", "filter.createdAt": "2026-01-01.." },
        table,
      )
    ).query;

    expect(query.clauses).toHaveLength(2);
  });

  it("drops a range it cannot read, and keeps the page unfiltered by it", async () => {
    // Silently, like every other refusal here. A message would say which
    // filters exist and what shape each of them takes.
    const table = Table.make().filters([DateRangeFilter.make("createdAt")]);

    expect(
      (await readList("User", IR, { "filter.createdAt": "yesterday..tomorrow" }, table))
        .query.clauses,
    ).toBeUndefined();
  });

  it("names the range it applied, not the one that arrived", async () => {
    // What comes back is what the control draws itself from and what the
    // address bar carries. Saying back the whole of a value half of which was
    // dropped leaves an unreadable date in a box that will not show it.
    const table = Table.make().filters([DateRangeFilter.make("createdAt")]);
    const { filters } = await readList(
      "User",
      IR,
      { "filter.createdAt": "2026-02-30..2026-06-30" },
      table,
    );

    expect(filters).toEqual({ createdAt: "..2026-06-30" });
  });

  it("runs a filter's own form, and takes the clauses it asks for", async () => {
    // Its fields are fields: the values arrive one parameter each, go through
    // the same admission a save does, and what the tree accepted is what the
    // query is handed.
    const table = Table.make().filters([
      SchemaFilter.make("named")
        .schema([TextInput.make("starts"), TextInput.make("ends")])
        .query(({ get }) => {
          const starts = get("starts");
          return typeof starts === "string" && starts !== ""
            ? [{ path: "name", operator: "startsWith" as const, value: starts }]
            : [];
        }),
    ]);

    const { query } = await readList(
      "User",
      IR,
      { "filter.named.starts": "Ada" },
      table,
      true,
      { user: null },
    );

    expect(query.clauses).toEqual([
      { path: "name", operator: "startsWith", value: "Ada" },
    ]);
  });

  it("gives the whole of a dotted path to the form, not to the name", async () => {
    // `filter.named.author.name` is the filter `named` and the path
    // `author.name`. Split at the last dot instead and the filter is called
    // `named.author`, which nothing declared, so the field goes silently
    // missing while the rest of the form still works.
    const seen: unknown[] = [];
    const table = Table.make().filters([
      SchemaFilter.make("named")
        .schema([TextInput.make("author.name")])
        .query(({ get }) => {
          seen.push(get("author.name"));
          return [];
        }),
    ]);

    await readList("User", IR, { "filter.named.author.name": "Ada" }, table, true, {
      user: null,
    });

    expect(seen).toEqual(["Ada"]);
  });

  it("gives the query what the fields declared, not only what arrived", async () => {
    // A `default()` is the form's own answer for a field nobody filled in.
    // Read off the sanitized values instead of the resolved tree it was
    // declared and applied nowhere: the control showed nothing chosen, and the
    // query read `undefined` for a choice the form had already made.
    const seen: unknown[] = [];
    const table = Table.make().filters([
      SchemaFilter.make("named")
        .schema([TextInput.make("starts").default("Ada")])
        .query(({ get }) => {
          seen.push(get("starts"));
          return [];
        }),
    ]);

    const { forms, filters } = await readList("User", IR, {}, table, true, {
      user: null,
    });

    expect(seen).toEqual(["Ada"]);
    expect(forms.get("named")?.state).toEqual({ starts: "Ada" });
    expect(filters).toEqual({ "named.starts": "Ada" });
  });

  it("gives the query the value a column holds, not the one a link wrote", async () => {
    // A closed set is declared with the values the column keeps. A link can
    // only carry the written form, and the field takes it back because it
    // compares choices that way — so nothing refuses it, the boot passes, the
    // control works, and the query compares `"1"` against an `Int` column and
    // finds nothing. The same trap `SelectFilter` names and answers.
    const seen: unknown[] = [];
    const table = Table.make().filters([
      SchemaFilter.make("on")
        .schema([
          Select.make("team").options([
            { value: 1, label: "One" },
            { value: 2, label: "Two" },
          ]),
        ])
        .query(({ get }) => {
          seen.push(get("team"));
          return [];
        }),
    ]);

    await readList("User", IR, { "filter.on.team": "1" }, table, true, { user: null });

    expect(seen).toEqual([1]);
  });

  it("leaves a value alone where nothing declared a set for it", async () => {
    const seen: unknown[] = [];
    const table = Table.make().filters([
      SchemaFilter.make("on")
        .schema([TextInput.make("term")])
        .query(({ get }) => {
          seen.push(get("term"));
          return [];
        }),
    ]);

    await readList("User", IR, { "filter.on.term": "1" }, table, true, { user: null });

    expect(seen).toEqual(["1"]);
  });

  it("hands the query nothing the tree would not have taken", async () => {
    // The trust boundary is the form's, not the filter's. A path nobody
    // declared is not there to be read, and nothing says it was dropped.
    const seen: unknown[] = [];
    const table = Table.make().filters([
      SchemaFilter.make("named")
        .schema([TextInput.make("starts")])
        .query(({ get }) => {
          seen.push(get("starts"), get("passwordHash"));
          return [];
        }),
    ]);

    await readList(
      "User",
      IR,
      { "filter.named.starts": "Ada", "filter.named.passwordHash": "x" },
      table,
      true,
      { user: null },
    );

    expect(seen).toEqual(["Ada", undefined]);
  });

  it("gives the control the tree it resolved, and the values it settled", async () => {
    const table = Table.make().filters([
      SchemaFilter.make("named")
        .schema([TextInput.make("starts")])
        .query(() => []),
    ]);

    const { forms, filters } = await readList(
      "User",
      IR,
      { "filter.named.starts": "Ada" },
      table,
      true,
      { user: null },
    );

    expect(forms.get("named")?.state).toEqual({ starts: "Ada" });
    expect(forms.get("named")?.tree?.children?.[0]?.type).toBe("TextInput");
    // Named once per field, under the parameter each of them arrived as, so a
    // narrowed page is still a link somebody can send.
    expect(filters).toEqual({ "named.starts": "Ada" });
  });

  it("drops a name nothing declared, without a word", async () => {
    // Like a sort on an undeclared column: an error would say which filters
    // exist.
    const table = Table.make().filters([TextFilter.make("title")]);

    expect(
      (await readList("User", IR, { "filter.passwordHash": "a" }, table)).query.clauses,
    ).toBeUndefined();
  });

  it("accepts no filter at all from a resource with no table", async () => {
    expect((await read({ "filter.title": "ada" })).clauses).toBeUndefined();
  });

  it("caps a filter's value like a search term", async () => {
    const table = Table.make().filters([TextFilter.make("title")]);
    const [clause] =
      (await readList("User", IR, { "filter.title": "a".repeat(5000) }, table)).query
        .clauses ?? [];

    expect(String(clause?.value)).toHaveLength(MAX_TERM);
  });

  it("never builds a filter from the query string", async () => {
    // A filter is a clause a resource declares. One that arrives from a URL and
    // reaches `where` untouched is an injection wearing the name of a feature.
    const query = await read({
      filters: JSON.stringify([
        { path: "passwordHash", operator: "contains", value: "a" },
      ]),
    });

    expect(query.clauses).toBeUndefined();
  });

  it("never builds an include from the query string", async () => {
    // The loading plan comes from the server's schema. Until a column declares
    // what it reaches, no relation is loaded at all.
    expect((await read({ include: "author" })).include).toBeUndefined();
  });
});

describe("a model the schema does not have", () => {
  it("still pages, and sorts by nothing", async () => {
    const query = (await readList("Ghost", IR, { sort: "id" })).query;

    expect(query).toMatchObject({ model: "Ghost", skip: 0 });
    expect(query.sort).toBeUndefined();
  });
});

describe("the filter that decides which rows are read", () => {
  const table = () =>
    Table.make()
      .columns([TextColumn.make("name")])
      .filters([TrashedFilter.make(), TextFilter.make("name")]);

  it("puts the reading mode on the query rather than in a clause", async () => {
    // Deletion is not a column a clause can name: a marked row is left out by
    // the read itself, so asking for it back is a different question.
    const query = (await readList("User", IR, { "filter.trashed": "with" }, table()))
      .query;

    expect(query.deleted).toBe("with");
    expect(query.clauses).toBeUndefined();
  });

  it("asks for those alone when that is the choice", async () => {
    expect(
      (await readList("User", IR, { "filter.trashed": "only" }, table())).query.deleted,
    ).toBe("only");
  });

  it("says nothing for a value nobody declared", async () => {
    expect(
      (await readList("User", IR, { "filter.trashed": "everything" }, table())).query
        .deleted,
    ).toBeUndefined();
  });

  it("is reported back as accepted, like every other filter", async () => {
    // A filter that produced no clause used to be dropped from this list, so a
    // control the server honoured drew itself back at its default.
    const { filters } = await readList(
      "User",
      IR,
      { "filter.trashed": "with" },
      table(),
    );

    expect(filters["trashed"]).toBe("with");
  });

  it("is not accepted at all from a reader who may not lift the exclusion", async () => {
    // Treated as a filter nobody declared: no lifting, and no echo saying it
    // was applied — a control cannot show a value the server ignored.
    const { query, filters } = await readList(
      "User",
      IR,
      { "filter.trashed": "with", "filter.name": "Ada" },
      table(),
      false,
    );

    expect(query.deleted).toBeUndefined();
    expect(filters["trashed"]).toBeUndefined();
    // And the narrowing filters beside it are untouched: it is one refusal,
    // not a reason to stop reading the request.
    expect(filters["name"]).toBe("Ada");
  });

  it("leaves the narrowing filters alone beside it", async () => {
    const query = (
      await readList(
        "User",
        IR,
        { "filter.trashed": "only", "filter.name": "ada" },
        table(),
      )
    ).query;

    expect(query.deleted).toBe("only");
    expect(query.clauses).toHaveLength(1);
  });
});
