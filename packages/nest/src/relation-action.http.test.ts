/**
 * Acting on a parent's children, over HTTP.
 *
 * The allowlist is the manager's table, not the resource's: an action declared
 * for the parent's own list is not one a child page offers, and reaching it by
 * name would carry it out against the wrong model's rows.
 *
 * And the selection is narrowed before anything runs. A child of another parent
 * is a perfectly valid row of the same model, so a key that names one has to be
 * dropped by the server rather than recognised as wrong by the row itself.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Query, Row } from "@perchjs/core";
import {
  Action,
  DeleteAction,
  Schema,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
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

/** An author's own action, so the modal route has a form to answer with. */
class NoteAction extends Action {
  static make(): NoteAction {
    return new NoteAction({});
  }
  override get type(): string {
    return "NoteAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new NoteAction(state) as this;
  }
}

let noted: Row[] = [];
let comments: Row[] = [];
let policy: Authorization | undefined;
let managerPolicy: Authorization | undefined;
/** What the resource's own list offers, which is not what a manager offers. */
let resourceActions: readonly Action[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, COMMENT] };
  }
  meta(name: string): ModelMeta {
    return name === "Comment" ? COMMENT : POST;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    const rows = (query.model === "Comment" ? comments : POSTS).filter((row) =>
      (query.clauses ?? []).every((clause) =>
        clause.operator === "in"
          ? (clause.value as readonly unknown[]).includes(row[clause.path])
          : row[clause.path] === clause.value,
      ),
    );
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(name: string, id: Id): Promise<Row | null> {
    const rows = name === "Comment" ? comments : POSTS;
    return Promise.resolve(rows.find((row) => row["id"] === id) ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(): Promise<Row> {
    throw new Error("not needed here");
  }
  delete(name: string, ids: readonly Id[]): Promise<number> {
    if (name !== "Comment") throw new Error("only children are deleted here");
    const before = comments.length;
    comments = comments.filter((row) => !ids.includes(row["id"] as Id));
    return Promise.resolve(before - comments.length);
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
  get can(): Authorization {
    return policy ?? {};
  }
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  table(): Table {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions(resourceActions);
  }
  relations(): readonly RelationManager[] {
    const manager = RelationManager.make("comments")
      .table((table) => table.columns([TextColumn.make("body")]))
      .actions([
        DeleteAction.make(),
        NoteAction.make()
          .form(Schema.make([TextInput.make("reason").required()]))
          .action((record) => {
            noted = [...noted, record];
          }),
      ]);
    return [managerPolicy === undefined ? manager : manager.authorize(managerPolicy)];
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-child-actions-"));
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
  comments = [
    { id: 10, body: "On the first", postId: 1 },
    { id: 11, body: "Also the first", postId: 1 },
    { id: 12, body: "On the second", postId: 2 },
  ];
  policy = undefined;
  managerPolicy = undefined;
  resourceActions = [];
  noted = [];

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

const act = async (
  at: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${url}${at}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
};

const ON_FIRST = "/admin/api/posts/1/relations/comments/actions/DeleteAction";

describe("an action on a parent's children", () => {
  it("carries it out on the ones ticked", async () => {
    const { status, body } = await act(ON_FIRST, { ids: [10, 11] });

    expect(status).toBe(200);
    expect(body["processed"]).toBe(2);
    expect(comments.map((row) => row["id"])).toEqual([12]);
  });

  it("comes from the manager's table, not the resource's", async () => {
    // An action the parent's own list declares is not one a child page offers.
    // Reaching it by name here would run it against the wrong model's rows.
    resourceActions = [DeleteAction.make().name("sweep")];

    expect(
      (await act("/admin/api/posts/1/relations/comments/actions/sweep", { ids: [10] }))
        .status,
    ).toBe(404);
    expect(comments).toHaveLength(3);
  });
});

describe("the parent's own action route", () => {
  it("does not reach children, whatever keys it is given", async () => {
    // The two routes name two models. A child key sent to the parent's route
    // is a key of the wrong table — which is why the manager gets a route of
    // its own rather than sharing one and passing the model along.
    resourceActions = [DeleteAction.make()];

    expect(
      (await act("/admin/api/posts/actions/DeleteAction", { ids: [10] })).status,
    ).toBe(404);
    expect(comments).toHaveLength(3);
  });
});

describe("a key naming another parent's child", () => {
  it("is dropped rather than acted on", async () => {
    const { body } = await act(ON_FIRST, { ids: [10, 12] });

    expect(body["processed"]).toBe(1);
    expect(comments.map((row) => row["id"])).toEqual([11, 12]);
  });

  it("is refused outright when it is all the request names", async () => {
    // Answered like a row that is not there, because from here that is what it
    // is: a caller learns nothing about children they were not shown.
    expect((await act(ON_FIRST, { ids: [12] })).status).toBe(404);
    expect(comments).toHaveLength(3);
  });
});

describe("who may run one", () => {
  it("is refused when the parent may not be edited", async () => {
    policy = { view: () => true, update: () => false };

    expect((await act(ON_FIRST, { ids: [10] })).status).toBe(404);
    expect(comments).toHaveLength(3);
  });

  it("asks the manager for the permission the action needs", async () => {
    // Deleting a child asks about deleting, not about editing.
    managerPolicy = { update: () => true, delete: () => false };

    expect((await act(ON_FIRST, { ids: [10] })).status).toBe(404);
    expect(comments).toHaveLength(3);
  });

  it("is refused for a relation nobody manages", async () => {
    expect(
      (
        await act("/admin/api/posts/1/relations/nothing/actions/DeleteAction", {
          ids: [10],
        })
      ).status,
    ).toBe(404);
  });

  it("is refused for a parent that is not there", async () => {
    expect(
      (
        await act("/admin/api/posts/404/relations/comments/actions/DeleteAction", {
          ids: [10],
        })
      ).status,
    ).toBe(404);
  });
});

describe("the modal a child action opens", () => {
  const FORM = "/admin/api/posts/1/relations/comments/actions/NoteAction/form";

  it("is the manager's action's own, resolved against the reader", async () => {
    const { status, body } = await act(FORM, { ids: [10] });

    expect(status).toBe(200);
    expect(JSON.stringify(body)).toContain("reason");
  });

  it("is refused for a child of another parent, like the run is", async () => {
    // Learning what a dialog asks for is learning the row is there.
    expect((await act(FORM, { ids: [12] })).status).toBe(404);
  });

  it("runs with what the modal collected, once it validates", async () => {
    const at = "/admin/api/posts/1/relations/comments/actions/NoteAction";

    const refused = await act(at, { ids: [10], data: {} });
    expect(Object.keys(refused.body["errors"] as object)).toEqual(["reason"]);
    expect(noted).toHaveLength(0);

    const done = await act(at, { ids: [10], data: { reason: "Off topic" } });
    expect(done.body["processed"]).toBe(1);
    expect(noted.map((row) => row["id"])).toEqual([10]);
  });
});
