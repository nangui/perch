/**
 * A parent's children, over HTTP.
 *
 * The order is the security. The parent is loaded and the reader authorised
 * against it before the relation is looked at, so a request naming a parent
 * they may not see learns nothing about what hangs off it — and the narrowing
 * comes from a column the server derived, never from anything the request
 * carried.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  Schema as SchemaTree,
} from "@perchjs/core";
import { Schema, TextColumn, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { RelationManager } from "./relation-manager.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const COMMENT: ModelMeta = model({
  name: "Comment",
  dbName: "Comment",
  fields: [key(), scalar("body"), scalar("postId", { type: "Int" })],
  labelField: "body",
  relations: [
    {
      name: "post",
      type: "one",
      targetModel: "Post",
      relationName: "CommentToPost",
      foreignKeyFields: ["postId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
});

const POST: ModelMeta = model({
  fields: [key(), scalar("title")],
  relations: [
    {
      name: "comments",
      type: "many",
      targetModel: "Comment",
      relationName: "CommentToPost",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
  ],
});

const POSTS: Row[] = [
  { id: 1, title: "First" },
  { id: 2, title: "Second" },
];

const COMMENTS: Row[] = [
  { id: 10, body: "On the first", postId: 1 },
  { id: 11, body: "Also the first", postId: 1 },
  { id: 12, body: "On the second", postId: 2 },
];

/** Every query the route built, so the narrowing is read rather than argued. */
let asked: Query[] = [];
let policy: Authorization | undefined;
/** A parent row that came back without the column its children point at. */
let hollow = false;
let managerPolicy: Authorization | undefined;

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, COMMENT] };
  }
  meta(name: string): ModelMeta {
    return name === "Comment" ? COMMENT : POST;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    asked.push(query);
    // Honours the clauses, or a double would answer every scope with every row.
    const rows = (query.model === "Comment" ? COMMENTS : POSTS).filter((row) =>
      (query.clauses ?? []).every((clause) => row[clause.path] === clause.value),
    );
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    const found = POSTS.find((row) => row["id"] === id) ?? null;
    if (found === null || !hollow) return Promise.resolve(found);
    return Promise.resolve(
      Object.fromEntries(Object.entries(found).filter(([name]) => name !== "id")),
    );
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
  // An empty policy is one that checks nothing, which is the default the
  // interface documents. A getter, so each test's `policy` is read per request.
  get can(): Authorization {
    return policy ?? {};
  }
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
  relations(): readonly RelationManager[] {
    const comments = RelationManager.make("comments")
      .label("Comments")
      .table((table) => table.columns([TextColumn.make("body")]))
      .form((schema) => schema.schema([TextInput.make("body").required()]));
    return [managerPolicy === undefined ? comments : comments.authorize(managerPolicy)];
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-relations-"));
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
  asked = [];
  policy = undefined;
  managerPolicy = undefined;
  hollow = false;

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

const children = async (
  at: string,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${url}${at}`);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
};

describe("a parent's children", () => {
  it("are the ones that belong to it, and no others", async () => {
    const { status, body } = await children(
      "/admin/api/posts/1/relations/comments/records",
    );

    expect(status).toBe(200);
    expect((body["rows"] as Row[]).map((row) => row["body"])).toEqual([
      "On the first",
      "Also the first",
    ]);
  });

  it("are narrowed by the column the server derived, not by the address", async () => {
    // The parent side of a to-many holds no foreign key; this is read off the
    // child's inverse relation.
    await children("/admin/api/posts/2/relations/comments/records");

    const query = asked.find((one) => one.model === "Comment");
    expect(query?.clauses).toEqual([{ path: "postId", operator: "equals", value: 2 }]);
  });

  it("carry the manager's own table, not the resource's", async () => {
    const { body } = await children("/admin/api/posts/1/relations/comments/records");
    const columns = body["columns"] as { columns: { path: string }[] };

    expect(columns.columns.map((one) => one.path)).toEqual(["body"]);
  });
});

describe("what a request cannot widen", () => {
  it("cannot ask for another parent's children through a filter", async () => {
    // A filter nobody declared is dropped, and the derived clause is added
    // after the declared ones — so nothing a client sends can replace it.
    await children("/admin/api/posts/1/relations/comments/records?filter.postId=2");

    const query = asked.find((one) => one.model === "Comment");
    expect(query?.clauses).toEqual([{ path: "postId", operator: "equals", value: 1 }]);
  });

  it("cannot reach a relation nobody manages", async () => {
    expect(
      (await children("/admin/api/posts/1/relations/nothing/records")).status,
    ).toBe(404);
  });

  it("cannot reach children of a parent that is not there", async () => {
    expect(
      (await children("/admin/api/posts/404/relations/comments/records")).status,
    ).toBe(404);
  });
});

describe("a parent holding nothing in the column its children point at", () => {
  it("is refused rather than narrowed by nothing", async () => {
    // Everything downstream of this value fails open without it: a clause
    // comparing to nothing, a create writing nothing into the owning column,
    // a selection matching every row that also has nothing there.
    hollow = true;

    expect(
      (await children("/admin/api/posts/1/relations/comments/records")).status,
    ).toBe(404);
    expect(asked.some((one) => one.model === "Comment")).toBe(false);
  });
});

describe("who may read them", () => {
  it("is refused when the parent may not be seen", async () => {
    policy = { view: () => false };

    expect(
      (await children("/admin/api/posts/1/relations/comments/records")).status,
    ).toBe(404);
  });

  it("asks about the parent before the relation is looked at", async () => {
    // A reader refused the parent learns nothing about what hangs off it — the
    // same 404 whether the relation exists or not.
    policy = { view: () => false };

    const managed = await children("/admin/api/posts/1/relations/comments/records");
    const invented = await children("/admin/api/posts/1/relations/nothing/records");
    expect(managed.status).toBe(invented.status);
  });

  it("is refused by the manager's own policy, with the parent allowed", async () => {
    // Its own, never the child resource's: the same model is managed
    // differently under different parents.
    policy = { view: () => true };
    managerPolicy = { view: () => false };

    expect(
      (await children("/admin/api/posts/1/relations/comments/records")).status,
    ).toBe(404);
  });
});
