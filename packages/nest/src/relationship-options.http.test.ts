/**
 * `Select.relationship()` over HTTP.
 *
 * Three routes serialise a resolved tree — the page, the live exchange and a
 * refused save — and a dropdown that is full on the first paint and empty on
 * the second is worse than one that was never filled, because the reader has
 * already seen it work. So all three are exercised here rather than the one
 * that is easiest to reach.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  SchemaNode,
  SchemaPayload,
} from "@perchjs/core";
import { Schema, Select, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { model } from "./__fixtures__/ir.js";

interface SaveAnswer {
  readonly errors?: Record<string, string>;
  readonly payload?: SchemaPayload;
}

const AUTHORS: readonly Row[] = [
  { id: 2, name: "Ada" },
  { id: 7, name: "Grace" },
];

const IR = {
  models: [
    {
      name: "Post",
      fields: [
        { name: "id", kind: "scalar", type: "Int", isId: true, isRequired: true },
        { name: "title", kind: "scalar", type: "String", isRequired: true },
        { name: "authorId", kind: "scalar", type: "Int", isRequired: true },
      ],
      relations: [
        {
          name: "author",
          type: "many-to-one",
          targetModel: "Author",
          foreignKeyFields: ["authorId"],
          referencedFields: ["id"],
          isRequired: true,
          isList: false,
        },
      ],
      primaryKey: "id",
      hasSoftDelete: false,
    },
    {
      name: "Author",
      fields: [
        { name: "id", kind: "scalar", type: "Int", isId: true, isRequired: true },
        { name: "name", kind: "scalar", type: "String", isRequired: true },
      ],
      relations: [],
      primaryKey: "id",
      hasSoftDelete: false,
    },
  ],
} as unknown as Ir;

let queries: Query[] = [];

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return IR;
  }
  meta(): ModelMeta {
    return model({ fields: [] });
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    queries.push(query);
    return Promise.resolve({ rows: AUTHORS, total: AUTHORS.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(id === 1 ? { id: 1, title: "First", authorId: 2 } : null);
  }
  create(): Promise<Row> {
    return Promise.resolve({ id: 9 });
  }
  update(): Promise<Row> {
    return Promise.resolve({ id: 1 });
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  /** Not exercised here: a double that answered zero would let a test
   * pass with nothing having happened. */
  forceDelete(): Promise<number> {
    throw new Error("not needed here");
  }
  restore(): Promise<number> {
    throw new Error("not needed here");
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title").required(),
      Select.make("authorId").relationship("author", "name"),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-rel-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication;
let url: string;

beforeEach(async () => {
  queries = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterEach(async () => {
  await app.close();
});

function payloadOf(html: string): SchemaPayload {
  const raw = /data-payload="([^"]*)"/.exec(html)?.[1] ?? "";
  return JSON.parse(
    raw
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&"),
  ) as SchemaPayload;
}

const field = (payload: SchemaPayload, path: string): SchemaNode | undefined =>
  payload.schema.children?.find((node) => node.path === path);

const LOADED = [
  { value: 2, label: "Ada" },
  { value: 7, label: "Grace" },
];

describe("the page that renders the form", () => {
  it("carries the options the relation names", async () => {
    const html = await (await fetch(`${url}/admin/posts/create`)).text();

    expect(field(payloadOf(html), "authorId")?.options).toEqual(LOADED);
  });

  it("carries them on the edit page too", async () => {
    const html = await (await fetch(`${url}/admin/posts/1/edit`)).text();

    expect(field(payloadOf(html), "authorId")?.options).toEqual(LOADED);
  });
});

describe("the live exchange", () => {
  it("still carries them, so a keystroke does not empty the list", async () => {
    const response = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: { title: "Ad" },
        dirtyPath: "title",
        operation: "create",
      }),
    });
    const payload = (await response.json()) as SchemaPayload;

    expect(field(payload, "authorId")?.options).toEqual(LOADED);
  });

  it("asks the database once, however many passes it takes", async () => {
    await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: { title: "Ad" },
        dirtyPath: "title",
        operation: "create",
      }),
    });

    expect(queries.filter((query) => query.model === "Author")).toHaveLength(1);
  });
});

describe("a save the server refuses", () => {
  it("hands back a tree whose list is still filled", async () => {
    const response = await fetch(`${url}/admin/api/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "" } }),
    });
    const body = (await response.json()) as SaveAnswer;

    expect(body.errors?.["title"]).toBeDefined();
    expect(
      body.payload === undefined ? undefined : field(body.payload, "authorId")?.options,
    ).toEqual(LOADED);
  });
});
