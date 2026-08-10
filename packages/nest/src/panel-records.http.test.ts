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
import type { DataAdapter, Id, Ir, ModelMeta, Query, Row } from "@perchjs/core";
import { IconColumn, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
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
  fields: [],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "title",
};

/** Records what it was asked, which is the only thing under test on this side. */
const asked: Query[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST] };
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
      .defaultSort("title", "desc");
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
    resources: [OpenResource, GatedResource, ListedResource, PerRowResource],
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
      columns: { columns: [] },
    });
  });

  it("pages, and asks the adapter for exactly that page", async () => {
    const url = await serve();
    const response = await get(`${url}/admin/api/posts/records?page=2&perPage=1`);

    expect(await response.json()).toMatchObject({ rows: [SHOWN[1]], total: 3 });
    expect(asked[0]).toMatchObject({ model: "Post", skip: 1, take: 1 });
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

  it("never turns a query parameter into a filter or an include", async () => {
    const url = await serve();
    await get(
      `${url}/admin/api/posts/records?filters=%5B%7B%22path%22%3A%22secret%22%7D%5D&include=author`,
    );

    expect(asked[0]?.filters).toBeUndefined();
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
