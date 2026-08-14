/**
 * `GET /records` over HTTP.
 *
 * The interesting cases are the refusals. A list cannot honour a rule written
 * about one row, and a query string is not a place a `where` clause comes from.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  FieldMeta,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
} from "@perchjs/core";
import {
  CreateAction,
  EditAction,
  IconColumn,
  Schema,
  SelectFilter,
  Table,
  TextColumn,
  TextFilter,
  TextInput,
} from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

/** Each row carries a column no table declares. That is the point. */
const ROWS: Row[] = [
  { id: 1, title: "Ada", passwordHash: "$2b$10$one" },
  { id: 2, title: "Grace", passwordHash: "$2b$10$two" },
  { id: 3, title: "Katherine", passwordHash: "$2b$10$three" },
];

const SHOWN = ROWS.map(({ id, title }) => ({ id, title }));

function field(name: string, type: string): FieldMeta {
  return {
    name,
    kind: "scalar",
    type,
    isRequired: true,
    isList: false,
    isId: name === "id",
    isUnique: false,
    isReadOnly: false,
    hasDefault: false,
    isLongText: false,
  } as FieldMeta;
}

const AUTHOR: ModelMeta = {
  name: "Author",
  dbName: "Author",
  primaryKey: field("id", "Int"),
  fields: [field("id", "Int"), field("name", "String")],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "name",
};

const POST: ModelMeta = {
  name: "Post",
  dbName: "Post",
  primaryKey: {
    name: "id",
    kind: "scalar",
    type: "Int",
    isRequired: true,
    isList: false,
    isId: true,
    isUnique: true,
    isReadOnly: true,
    hasDefault: true,
    isLongText: false,
  },
  // Filled rather than stubbed: the columns below read these, and an IR that
  // says `Post` exists with no fields is a convenience that made every one of
  // them read nothing.
  fields: [
    field("id", "Int"),
    field("title", "String"),
    field("published", "Boolean"),
    field("authorId", "Int"),
  ],
  relations: [
    {
      name: "author",
      type: "one",
      targetModel: "Author",
      foreignKeyFields: ["authorId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "title",
};

/** Records what it was asked, which is the only thing under test on this side. */
const asked: Query[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, AUTHOR] };
  }
  meta(): ModelMeta {
    return POST;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    asked.push(query);
    const from = query.skip ?? 0;
    return Promise.resolve({
      rows: ROWS.slice(from, from + (query.take ?? ROWS.length)),
      total: ROWS.length,
    });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(): Promise<Row> {
    throw new Error("not needed here");
  }
  delete(): Promise<number> {
    throw new Error("not needed here");
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string };
    }>();
    request.user = { id: request.headers["x-user"] ?? "nobody" };
    return true;
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class OpenResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
}

@PanelResource({ model: "Post", slug: "gated" })
class GatedResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  can: Authorization = { viewAny: (user) => (user as { id: string }).id === "ada" };
}

@PanelResource({ model: "Post", slug: "listed" })
class ListedResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("title").label("Headline").sortable(),
        TextColumn.make("author.name").label("Author"),
        IconColumn.make("published").boolean(),
      ])
      .actions([EditAction.make()])
      .headerActions([CreateAction.make()])
      .defaultSort("title", "desc");
  }
}

@PanelResource({ model: "Post", slug: "searchable" })
class SearchableResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("title").searchable(),
        // Displayed and not searchable: a column is one or the other only if it
        // says so.
        TextColumn.make("author.name"),
      ])
      .filters([
        TextFilter.make("headline").path("title").label("Headline"),
        SelectFilter.make("published").options([
          { value: true, label: "Published" },
          { value: false, label: "Draft" },
        ]),
      ]);
  }
}

@PanelResource({ model: "Post", slug: "per-row" })
class PerRowResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  can: Authorization = { view: () => true };
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-records-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  asked.length = 0;
});

async function serve(withAdapter = true): Promise<string> {
  const base = {
    path: "/admin",
    resources: [
      OpenResource,
      GatedResource,
      ListedResource,
      SearchableResource,
      PerRowResource,
    ],
    guards: [HeaderGuard],
    assets: assets(),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot(withAdapter ? { ...base, dataAdapter: MemoryAdapter } : base),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const get = (url: string, user = "ada") => fetch(url, { headers: { "x-user": user } });

describe("listing records", () => {
  it("answers with the rows and the total", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/api/posts/records`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      // Not `ROWS`: without a table the default is the key and the label, which
      // is the same narrow pair the sort allowlist falls back to.
      rows: SHOWN,
      total: 3,
      // Which page was served and how big it is, so the client can draw its
      // controls from the answer rather than from what it asked for.
      page: 1,
      perPage: 25,
      columns: {
        columns: [],
        filters: [],
        actions: [],
        headerActions: [],
        bulkActions: [],
      },
      // How a row action addresses one row, said rather than assumed.
      recordKey: "id",
      resourcePath: "/admin/posts",
    });
  });

  it("pages, and asks the adapter for exactly that page", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/api/posts/records?page=2&perPage=1`);

    expect(await response.json()).toMatchObject({
      rows: [SHOWN[1]],
      total: 3,
      // Which page was served, read from the query the server built rather
      // than echoed back from what was asked.
      page: 2,
      perPage: 1,
    });
    expect(asked[0]).toMatchObject({ model: "Post", skip: 1, take: 1 });
  });

  it("answers with the page it served, not the one that was asked for", async () => {
    // Paging stops at a depth past which nobody is reading. A client drawing
    // its controls from what it requested would show page 999999 of 1.
    const url = await serve();
    const response = await get(`${url}/admin/api/posts/records?page=999999&perPage=10`);

    const body = (await response.json()) as { page: number; perPage: number };

    expect(body.perPage).toBe(10);
    expect(body.page).toBeLessThan(999999);
    expect(asked[0]?.skip).toBe((body.page - 1) * 10);
  });

  it("sorts by the label, and silently not by anything else", async () => {
    const url = await serve();
    await get(`${url}/admin/api/posts/records?sort=title:desc`);
    await get(`${url}/admin/api/posts/records?sort=secret`);

    expect(asked[0]?.sort).toEqual([{ path: "title", direction: "desc" }]);
    expect(asked[1]?.sort).toBeUndefined();
    // Silently: the second request is a plain 200, telling the caller nothing
    // about whether `secret` is a column.
    expect(asked).toHaveLength(2);
  });

  it("searches the field a human reads, when no table says otherwise", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/api/posts/records?search=ada`);

    expect(asked[0]?.search).toEqual({ term: "ada", paths: ["title"] });
    // Echoed, so the box on the client shows what was searched for rather than
    // what was typed: the term is capped, and a table can drop it entirely.
    expect(await response.json()).toMatchObject({ search: "ada" });
  });

  it("says nothing about a search it did not run", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/api/listed/records?search=ada`);

    expect(await response.json()).not.toHaveProperty("search");
  });

  it("searches exactly the columns a table declared", async () => {
    const url = await serve();
    await get(`${url}/admin/api/searchable/records?search=ada`);

    expect(asked[0]?.search).toEqual({ term: "ada", paths: ["title"] });
  });

  it("searches nothing when a table declares nothing searchable", async () => {
    // Not everything. A table that named its columns and asked for no search
    // asked for no search, and the request is still a plain 200 — the refusal
    // tells the caller nothing about which columns exist.
    const url = await serve();
    const response = await get(`${url}/admin/api/listed/records?search=ada`);

    expect(response.status).toBe(200);
    expect(asked[0]?.search).toBeUndefined();
  });

  it("filters by a declared name, and by nothing else", async () => {
    const url = await serve();
    await get(`${url}/admin/api/searchable/records?filter.headline=ada`);
    await get(`${url}/admin/api/searchable/records?filter.passwordHash=a`);

    // The path is the declaration's, not the caller's: the filter is named
    // `headline` and reaches `title`.
    expect(asked[0]?.clauses).toEqual([
      { path: "title", operator: "contains", value: "ada" },
    ]);
    // Silently, so the refusal says nothing about which filters exist.
    expect(asked[1]?.clauses).toBeUndefined();
  });

  it("answers a choice only with a value it declared", async () => {
    // The closed set, over HTTP. Without it `filter.published=<anything>` asks
    // whether a row exists with that value in that column, one guess at a time.
    const url = await serve();
    await get(`${url}/admin/api/searchable/records?filter.published=true`);
    await get(`${url}/admin/api/searchable/records?filter.published=maybe`);

    // `true` the boolean, not `"true"` the string a URL carries.
    expect(asked[0]?.clauses).toEqual([
      { path: "published", operator: "equals", value: true },
    ]);
    expect(asked[1]?.clauses).toBeUndefined();
  });

  it("says which filters it applied", async () => {
    // What the controls are drawn from. A name it declined never appears, so a
    // control cannot show a value the server ignored.
    const url = await serve();
    const applied = await (
      await get(`${url}/admin/api/searchable/records?filter.headline=ada&filter.nope=x`)
    ).json();

    expect(applied).toMatchObject({ filters: { headline: "ada" } });
    expect((applied as { filters: Record<string, string> }).filters).not.toHaveProperty(
      "nope",
    );
  });

  it("says nothing about filters when none were applied", async () => {
    const url = await serve();
    const body = await (await get(`${url}/admin/api/searchable/records`)).json();

    expect(body).not.toHaveProperty("filters");
  });

  it("sends the filters it declared, and nothing about what they do", async () => {
    const url = await serve();
    const body = (await (await get(`${url}/admin/api/searchable/records`)).json()) as {
      columns: { filters: unknown };
    };

    expect(body.columns.filters).toEqual([
      { type: "TextFilter", name: "headline", label: "Headline" },
      {
        type: "SelectFilter",
        name: "published",
        // Stringified for the control, and turned back on the way in.
        options: [
          { value: "true", label: "Published" },
          { value: "false", label: "Draft" },
        ],
      },
    ]);
  });

  it("never turns a query parameter into a filter or an include", async () => {
    const url = await serve();
    await get(
      `${url}/admin/api/posts/records?filters=%5B%7B%22path%22%3A%22secret%22%7D%5D&include=author`,
    );

    expect(asked[0]?.clauses).toBeUndefined();
    expect(asked[0]?.include).toBeUndefined();
  });
});

describe("the columns a resource declares", () => {
  it("sends the tree, and only what the client renders from", async () => {
    const url = await serve();
    const body = (await (await get(`${url}/admin/api/listed/records`)).json()) as {
      columns: unknown;
    };

    expect(body.columns).toEqual({
      columns: [
        { type: "TextColumn", path: "title", label: "Headline", sortable: true },
        { type: "TextColumn", path: "author.name", label: "Author" },
        { type: "IconColumn", path: "published", boolean: true },
      ],
      filters: [],
      actions: [{ type: "EditAction", name: "EditAction", trigger: "link" }],
      headerActions: [{ type: "CreateAction", name: "CreateAction", trigger: "link" }],
      bulkActions: [],
      defaultSort: { path: "title", direction: "desc" },
    });
  });

  it("sends only the columns it declared, whatever the row carries", async () => {
    // The rule `serialise.ts` states for forms, applied to a row: hiding on the
    // client is a leak, and what the client never receives cannot leak.
    const url = await serve();
    const body = (await (await get(`${url}/admin/api/listed/records`)).json()) as {
      rows: Record<string, unknown>[];
    };

    expect(body.rows[0]).toEqual({ id: 1, title: "Ada" });
    for (const row of body.rows) expect(row).not.toHaveProperty("passwordHash");
  });

  it("sorts by a column that asked, and by nothing else", async () => {
    const url = await serve();
    await get(`${url}/admin/api/listed/records?sort=title:desc`);
    await get(`${url}/admin/api/listed/records?sort=author.name`);
    // Declaring a table replaces the fallback outright: the key is refused too,
    // because it did not ask.
    await get(`${url}/admin/api/listed/records?sort=id`);

    expect(asked[0]?.sort).toEqual([{ path: "title", direction: "desc" }]);
    expect(asked[1]?.sort).toBeUndefined();
    expect(asked[2]?.sort).toBeUndefined();
  });
});

describe("the list page", () => {
  it("serves a shell carrying the first page, so nothing is fetched twice", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/listed`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('data-operation="list"');
    // The payload is the records response, escaped into the attribute.
    expect(html).toContain("&quot;total&quot;:3");
    expect(html).toContain("&quot;TextColumn&quot;");
  });

  it("does not let the shell carry what the table never declared", async () => {
    // The page embeds what the API answers, so it inherits the projection —
    // and a leak here would be in the page source rather than behind a fetch.
    const url = await serve();
    const html = await (await get(`${url}/admin/listed`)).text();

    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain("2b$10");
  });

  it("keeps the host's prefix in the path a row action points at", async () => {
    // The panel's root is the server's to know: a host may add a prefix, and a
    // browser reconstructing it from the API path would get it wrong.
    const url = await serve();
    const response = await fetch(`${url}/admin/api/listed/records`, {
      headers: { "x-user": "ada" },
    });
    const body = (await response.json()) as { resourcePath: string; recordKey: string };

    expect(body.resourcePath).toBe("/admin/listed");
    expect(body.recordKey).toBe("id");
  });

  it("refuses the page exactly as it refuses the route", async () => {
    const url = await serve();

    expect((await get(`${url}/admin/ghost`)).status).toBe(404);
    expect((await get(`${url}/admin/gated`, "grace")).status).toBe(404);
    expect((await get(`${url}/admin/per-row`)).status).toBe(404);
  });

  it("carries the panel menu, filtered by what this user may reach", async () => {
    // A `viewAny` refusal removes the entry. `gated` is Ada's.
    const url = await serve();
    const asAda = await (await get(`${url}/admin/listed`, "ada")).text();
    const asGrace = await (await get(`${url}/admin/listed`, "grace")).text();

    expect(asAda).toContain("&quot;/admin/gated&quot;");
    expect(asGrace).not.toContain("&quot;/admin/gated&quot;");
    expect(asGrace).toContain("&quot;/admin/listed&quot;");
  });

  it("gives a form page the trail back to its list", async () => {
    // Breadcrumbs are v0.1 chrome. Everything the bundle needs travels on the
    // mount element, this included.
    const url = await serve();
    const html = await (await get(`${url}/admin/listed/create`)).text();

    expect(html).toContain('data-list-path="/admin/listed"');
    expect(html).toContain('data-list-label="Posts"');
  });

  it("opens the list on the page and order the URL asks for", async () => {
    // Half of "reloading restores the exact state, and the URL is shareable":
    // the page embeds its first records rather than fetching them, so what it
    // embeds has to be what the address says.
    const url = await serve();
    const html = await (
      await get(`${url}/admin/listed?sort=title:asc&page=2&perPage=2`)
    ).text();

    expect(html).toContain("&quot;page&quot;:2");
    expect(html).toContain("&quot;perPage&quot;:2");
    expect(html).toContain(
      "&quot;sort&quot;:{&quot;path&quot;:&quot;title&quot;,&quot;direction&quot;:&quot;asc&quot;}",
    );
    expect(asked[0]).toMatchObject({ skip: 2, take: 2 });
  });

  it("does not shadow the two-segment pages", async () => {
    const url = await serve();

    expect((await get(`${url}/admin/listed/create`)).status).toBe(200);
  });
});

describe("what it refuses, all with the same answer", () => {
  it("404s a resource that is not there", async () => {
    const url = await serve();

    expect((await get(`${url}/admin/api/ghost/records`)).status).toBe(404);
  });

  it("404s a resource the user may not reach", async () => {
    const url = await serve();

    expect((await get(`${url}/admin/api/gated/records`, "grace")).status).toBe(404);
    expect((await get(`${url}/admin/api/gated/records`, "ada")).status).toBe(200);
  });

  it("404s a resource whose visibility is decided row by row", async () => {
    // Fails closed. Answering `can.view` after the fact would send rows the
    // caller may not open across the wire and then drop some of them, leaving a
    // short page and a total that lies. Scoping belongs to the adapter and does
    // not exist, so the list does not either.
    const url = await serve();

    expect((await get(`${url}/admin/api/per-row/records`)).status).toBe(404);
    expect(asked).toHaveLength(0);
  });

  it("404s when the panel has no adapter at all", async () => {
    const url = await serve(false);

    expect((await get(`${url}/admin/api/posts/records`)).status).toBe(404);
  });
});

describe("a column that reads through a relation", () => {
  it("asks for it once, in the page's own query", async () => {
    // Invariant 7. One `include` merged from the columns, so a page of fifty
    // rows costs the same as a page of one.
    const url = await serve();
    asked.length = 0;

    await get(`${url}/admin/api/listed/records`);

    expect(asked).toHaveLength(1);
    expect(asked[0]?.include).toEqual({ author: true });
  });

  it("asks for nothing where no column reaches out", async () => {
    // A plan is derived from what the columns declare, never from a parameter:
    // a client asking for a relation is asking the wrong side.
    const url = await serve();
    asked.length = 0;

    await get(`${url}/admin/api/posts/records`);

    expect(asked).toHaveLength(1);
    expect(asked[0]?.include).toBeUndefined();
  });

  it("cannot be widened by anything a client sends", async () => {
    const url = await serve();
    asked.length = 0;

    await get(`${url}/admin/api/listed/records?include=author.secrets&with=author`);

    expect(asked[0]?.include).toEqual({ author: true });
  });
});
