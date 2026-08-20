/**
 * Writing one of a parent's children, over HTTP.
 *
 * Two things a request never gets to decide. Which parent the child belongs to
 * — the column comes from the address and is written last, over whatever the
 * form produced — and, on an edit, which child it is: a key is a number anybody
 * can type, so the row is read and checked against the parent first.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Field,
  Id,
  Ir,
  ModelMeta,
  Row,
  Schema as SchemaTree,
  WriteTree,
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

/** Rewritten per test, so one write cannot be read by the next. */
let comments: Row[] = [];
let policy: Authorization | undefined;
let managerPolicy: Authorization | undefined;
/** `null` is a manager that declares no form, which neither creates nor edits. */
let fields: readonly Field[] | null = null;
let next = 100;

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, COMMENT] };
  }
  meta(name: string): ModelMeta {
    return name === "Comment" ? COMMENT : POST;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    throw new Error("not needed here");
  }
  findOne(name: string, id: Id): Promise<Row | null> {
    const rows = name === "Comment" ? comments : POSTS;
    return Promise.resolve(rows.find((row) => row["id"] === id) ?? null);
  }
  create(name: string, data: WriteTree): Promise<Row> {
    if (name !== "Comment") throw new Error("only children are written here");
    next += 1;
    const row: Row = { id: next, ...data.set };
    comments.push(row);
    return Promise.resolve(row);
  }
  update(name: string, id: Id, data: WriteTree): Promise<Row> {
    const at = comments.findIndex((row) => row["id"] === id);
    if (at === -1 || name !== "Comment") throw new Error("no such row");
    const row: Row = { ...comments[at], ...data.set };
    comments[at] = row;
    return Promise.resolve(row);
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
  get can(): Authorization {
    return policy ?? {};
  }
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
  relations(): readonly RelationManager[] {
    let manager = RelationManager.make("comments")
      .label("Comments")
      .table((table) => table.columns([TextColumn.make("body")]));
    if (fields !== null) {
      const declared = fields;
      manager = manager.form((schema) => schema.schema(declared));
    }
    return [managerPolicy === undefined ? manager : manager.authorize(managerPolicy)];
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-child-write-"));
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
    { id: 12, body: "On the second", postId: 2 },
  ];
  policy = undefined;
  managerPolicy = undefined;
  fields = [TextInput.make("body").required()];

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

const write = async (
  at: string,
  state: Record<string, unknown>,
  method = "POST",
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${url}${at}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
};

describe("creating a child", () => {
  it("writes it under the parent in the address", async () => {
    const { status } = await write("/admin/api/posts/1/relations/comments", {
      body: "Fresh",
    });

    expect(status).toBe(200);
    expect(comments.at(-1)).toMatchObject({ body: "Fresh", postId: 1 });
  });

  it("fills the parent column even when the form declared it", async () => {
    // The column the address decided, written over whatever came out of the
    // form. A field that could reassign a child to another parent is one that
    // would.
    fields = [TextInput.make("body").required(), TextInput.make("postId")];

    await write("/admin/api/posts/1/relations/comments", {
      body: "Fresh",
      postId: "2",
    });

    expect(comments.at(-1)).toMatchObject({ postId: 1 });
  });

  it("answers with the key and nothing else", async () => {
    const { body } = await write("/admin/api/posts/1/relations/comments", {
      body: "Fresh",
    });

    expect(Object.keys(body["record"] as Row)).toEqual(["id"]);
  });

  it("touches nothing when the form has errors", async () => {
    const before = comments.length;
    const { body } = await write("/admin/api/posts/1/relations/comments", {
      body: "",
    });

    expect(Object.keys(body["errors"] as object)).toEqual(["body"]);
    expect(comments).toHaveLength(before);
  });
});

describe("editing a child", () => {
  it("edits the one the address names", async () => {
    const { status } = await write(
      "/admin/api/posts/1/relations/comments/10",
      { body: "Reworded" },
      "PATCH",
    );

    expect(status).toBe(200);
    expect(comments.find((row) => row["id"] === 10)).toMatchObject({
      body: "Reworded",
      postId: 1,
    });
  });

  it("refuses one that belongs to another parent", async () => {
    // Comment 12 is post 2's. Reaching it from post 1 is a matter of typing.
    const { status } = await write(
      "/admin/api/posts/1/relations/comments/12",
      { body: "Stolen" },
      "PATCH",
    );

    expect(status).toBe(404);
    expect(comments.find((row) => row["id"] === 12)).toMatchObject({
      body: "On the second",
    });
  });

  it("refuses one that is not there at all", async () => {
    const { status } = await write(
      "/admin/api/posts/1/relations/comments/404",
      { body: "Nowhere" },
      "PATCH",
    );

    expect(status).toBe(404);
  });
});

describe("who may write one", () => {
  it("is refused when the parent may not be seen", async () => {
    // Seeing the parent is what reaching a manager costs. What may then be
    // done there is the manager's own policy to say, which is why the resource
    // is asked `view` here and not `update`.
    policy = { view: () => false };

    expect(
      (await write("/admin/api/posts/1/relations/comments", { body: "Fresh" })).status,
    ).toBe(404);
    expect(comments).toHaveLength(2);
  });

  it("is not held to the parent's own edit policy", async () => {
    // A reader who may not edit the post itself may still be the one who
    // moderates its comments. Borrowing the parent's rule would decide that
    // somewhere its author never looked.
    policy = { view: () => true, update: () => false };

    expect(
      (await write("/admin/api/posts/1/relations/comments", { body: "Fresh" })).status,
    ).toBe(200);
  });

  it("is refused by the manager's own policy, with the parent allowed", async () => {
    policy = { update: () => true };
    managerPolicy = { update: () => false };

    expect(
      (
        await write(
          "/admin/api/posts/1/relations/comments/10",
          { body: "Reworded" },
          "PATCH",
        )
      ).status,
    ).toBe(404);
  });

  it("asks the manager for permission to add, not permission to change", async () => {
    // Adding a child and changing one are separate permissions. A manager
    // declaring `create` means it, and asking `update` instead would let a
    // reader allowed only to edit add rows.
    managerPolicy = { create: () => false, update: () => true };

    expect(
      (await write("/admin/api/posts/1/relations/comments", { body: "Fresh" })).status,
    ).toBe(404);
    expect(comments).toHaveLength(2);
  });

  it("does not hold an edit to the permission to add", async () => {
    managerPolicy = { create: () => false, update: () => true };

    expect(
      (
        await write(
          "/admin/api/posts/1/relations/comments/10",
          { body: "Reworded" },
          "PATCH",
        )
      ).status,
    ).toBe(200);
  });

  it("is refused where the manager declares no form", async () => {
    fields = null;

    expect(
      (await write("/admin/api/posts/1/relations/comments", { body: "Fresh" })).status,
    ).toBe(404);
  });

  it("is refused for a parent that is not there", async () => {
    expect(
      (await write("/admin/api/posts/404/relations/comments", { body: "Fresh" }))
        .status,
    ).toBe(404);
  });

  it("is refused for a relation nobody manages", async () => {
    expect(
      (await write("/admin/api/posts/1/relations/nothing", { body: "Fresh" })).status,
    ).toBe(404);
  });
});
