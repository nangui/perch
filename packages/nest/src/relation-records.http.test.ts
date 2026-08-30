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
import { ImageColumn, Schema, TextColumn, TextInput } from "@perchjs/core";
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

const TAG: ModelMeta = model({
  name: "Tag",
  fields: [key(), scalar("name")],
  relations: [
    {
      name: "posts",
      type: "many",
      targetModel: "Post",
      relationName: "PostToTag",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
  ],
});

/** The join itself, which in a database is a table and here is a pair list. */
let TAGGED: { post: number; tag: number }[] = [
  { post: 1, tag: 10 },
  { post: 1, tag: 11 },
  { post: 2, tag: 11 },
];

const TAGS: readonly Row[] = [
  { id: 10, name: "green" },
  { id: 11, name: "blue" },
  { id: 12, name: "nobody's" },
];

const POST: ModelMeta = model({
  fields: [key(), scalar("title")],
  relations: [
    {
      name: "tags",
      type: "many",
      targetModel: "Tag",
      relationName: "PostToTag",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
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
  // Joined to nothing, so an empty page can be told from a broken narrowing.
  { id: 3, title: "Third" },
];

const COMMENTS: Row[] = [
  { id: 10, body: "On the first", postId: 1, cover: "covers/one.png" },
  { id: 11, body: "Also the first", postId: 1 },
  { id: 12, body: "On the second", postId: 2 },
];

/** Every query the route built, so the narrowing is read rather than argued. */
let asked: Query[] = [];
const reads: string[] = [];
let policy: Authorization | undefined;
/** A parent row that came back without the column its children point at. */
let hollow = false;
let managerPolicy: Authorization | undefined;
let tagsPolicy: Authorization | undefined;

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, COMMENT, TAG] };
  }
  meta(name: string): ModelMeta {
    if (name === "Comment") return COMMENT;
    return name === "Tag" ? TAG : POST;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    asked.push(query);
    // Honours the join, or a double would answer every parent with every row —
    // which is the shape of the bug this narrowing exists to prevent.
    if (query.model === "Tag") {
      const wanted = query.clauses?.find((one) => one.operator === "in");
      if (wanted !== undefined) {
        const keys = new Set((wanted.value as readonly unknown[]).map(String));
        const picked = TAGS.filter((tag) => keys.has(String(tag["id"])));
        return Promise.resolve({ rows: picked, total: picked.length });
      }
      const joined = query.joinedTo;
      const rows =
        joined === undefined
          ? TAGS
          : TAGS.filter((tag) =>
              TAGGED.some(
                (link) => link.tag === tag["id"] && link.post === Number(joined.value),
              ),
            );
      return Promise.resolve({ rows, total: rows.length });
    }
    // Honours the clauses, or a double would answer every scope with every row.
    const rows = (query.model === "Comment" ? COMMENTS : POSTS).filter((row) =>
      (query.clauses ?? []).every((clause) => row[clause.path] === clause.value),
    );
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(model: string, id: Id): Promise<Row | null> {
    // Recorded like a page read: a check written one row at a time is still a
    // query per row, and a counter that only watched `findMany` would call it
    // one query and be wrong.
    reads.push(model);
    // Answers for the joined model too: attaching reads every row it was given
    // before writing anything, and a double that knew only one table would
    // refuse them all.
    if (model === "Tag") {
      return Promise.resolve(TAGS.find((row) => row["id"] === id) ?? null);
    }
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

  attach(
    _model: string,
    id: Id,
    _relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    for (const target of targets) {
      const link = { post: Number(id), tag: Number(target) };
      if (!TAGGED.some((one) => one.post === link.post && one.tag === link.tag)) {
        TAGGED.push(link);
      }
    }
    return Promise.resolve();
  }
  detach(
    _model: string,
    id: Id,
    _relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    const dropped = new Set(targets.map(Number));
    for (let at = TAGGED.length - 1; at >= 0; at -= 1) {
      const link = TAGGED[at];
      if (link !== undefined && link.post === Number(id) && dropped.has(link.tag)) {
        TAGGED.splice(at, 1);
      }
    }
    return Promise.resolve();
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
      .table((table) =>
        table.columns([
          TextColumn.make("body"),
          // A column of uploads inside a manager: its keys resolve through the
          // same disks the resource's own table is listed with.
          ImageColumn.make("cover").disk("default"),
        ]),
      )
      .form((schema) => schema.schema([TextInput.make("body").required()]));
    // Joined rather than owned: no column narrows it, so it lists and does
    // nothing else — which is why it declares neither a form nor an action.
    const joined = RelationManager.make("tags")
      .label("Tags")
      .table((table) => table.columns([TextColumn.make("name")]));
    const tags = tagsPolicy === undefined ? joined : joined.authorize(tagsPolicy);
    return [
      managerPolicy === undefined ? comments : comments.authorize(managerPolicy),
      tags,
    ];
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-relations-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication;
let url: string;

beforeEach(() => {
  // Restored between tests, since attaching and detaching change it.
  TAGGED = [
    { post: 1, tag: 10 },
    { post: 1, tag: 11 },
    { post: 2, tag: 11 },
  ];
});

beforeEach(async () => {
  asked = [];
  policy = undefined;
  managerPolicy = undefined;
  tagsPolicy = undefined;
  hollow = false;

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
        // One disk, so a column of uploads has something to resolve through.
        disks: {
          default: {
            stage: () => {
              throw new Error("not needed here");
            },
            commit: () => {
              throw new Error("not needed here");
            },
            remove: () => Promise.resolve(),
            sweepStaged: () => Promise.resolve(0),
            url: (key: string) => `/uploads/${key}`,
          },
        },
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

describe("a column of uploads inside a manager", () => {
  it("resolves its keys, the way the resource's own table does", async () => {
    // Listed without the disks, the column draws an empty cell in every row —
    // and the boot check that reads a manager's table would have said the disk
    // was fine.
    const { body } = await children("/admin/api/posts/1/relations/comments/records");
    const rows = body["rows"] as readonly Record<string, unknown>[];

    expect(rows[0]?.["cover"]).toBe("/uploads/covers/one.png");
  });
});

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

    expect(columns.columns.map((one) => one.path)).toEqual(["body", "cover"]);
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

describe("the page the managers are drawn on", () => {
  const html = async (at: string): Promise<{ status: number; body: string }> => {
    const response = await fetch(`${url}${at}`);
    return { status: response.status, body: await response.text() };
  };

  it("names them on the edit page, so the client can draw a tab each", async () => {
    const { body } = await html("/admin/posts/1/edit");

    expect(body).toContain("data-relations=");
    expect(body).toContain("comments");
    expect(body).toContain("Comments");
  });

  it("sends no rows with them", async () => {
    // A record with six managers costs one page, not seven. What a tab holds
    // is fetched when it is opened.
    await html("/admin/posts/1/edit");

    expect(asked.some((one) => one.model === "Comment")).toBe(false);
  });

  it("names none on the create page, which has no record to hang them off", async () => {
    const { body } = await html("/admin/posts/create");

    expect(body).not.toContain("data-relations=");
  });
});

/**
 * A manager over a relation joined through a table neither model owns.
 *
 * There is no column holding the parent's key — the join table is the
 * database's — so what narrows the read names the relation instead. Getting it
 * wrong does not fail loudly: it answers every parent with every row, which
 * reads as a page that works.
 */
describe("reading through a join", () => {
  const tagsOf = async (
    who: string,
  ): Promise<{ rows: readonly Row[]; total: number }> => {
    const { body } = await children(`/admin/api/posts/${who}/relations/tags/records`);
    return body as unknown as { rows: readonly Row[]; total: number };
  };

  it("lists the rows joined to this parent and no others", async () => {
    expect((await tagsOf("1")).rows.map((row) => row["name"])).toEqual([
      "green",
      "blue",
    ]);
    expect((await tagsOf("2")).rows.map((row) => row["name"])).toEqual(["blue"]);
  });

  it("lists nothing for a parent joined to nothing", async () => {
    // Distinct from a failure, and it has to be: an empty page and a broken
    // narrowing look the same from the outside unless something says which.
    const answer = await tagsOf("3");
    expect(answer.rows).toEqual([]);
    expect(answer.total).toBe(0);
  });

  it("never shows a row joined to nobody", async () => {
    const seen = await Promise.all(["1", "2", "3"].map(tagsOf));
    const names = seen.flatMap((page) => page.rows.map((row) => row["name"]));

    expect(names).not.toContain("nobody's");
  });

  it("narrows by the relation rather than by a clause", async () => {
    // The distinction that matters: a clause on a column that is not there
    // matches nothing and would read as an empty relation, and a clause left
    // off entirely matches everything and would read as somebody else's rows.
    asked.length = 0;
    await tagsOf("1");
    const query = asked.find((one) => one.model === "Tag");

    expect(query?.joinedTo).toEqual({ relation: "posts", key: "id", value: 1 });
    expect(query?.clauses ?? []).toEqual([]);
  });
});

/**
 * The two verbs a many-to-many has, and the only two.
 *
 * Its join table belongs to neither model, so there is no column for a create
 * to fill and nothing for a delete to remove. A row exists on its own and is
 * joined to this parent, or it is not.
 */
describe("attaching and detaching", () => {
  const tagsOf = async (who: string): Promise<readonly string[]> => {
    const { body } = await children(`/admin/api/posts/${who}/relations/tags/records`);
    const page = body as unknown as { rows: readonly Row[] };
    return page.rows.map((row) => String(row["name"]));
  };

  const join = async (
    who: string,
    verb: "attach" | "detach",
    ids: readonly unknown[],
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(
      `${url}/admin/api/posts/${who}/relations/tags/${verb}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      },
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  it("joins a row to this parent and to no other", async () => {
    expect(await tagsOf("3")).toEqual([]);

    expect((await join("3", "attach", [12])).status).toBe(200);

    expect(await tagsOf("3")).toEqual(["nobody's"]);
    // The others are untouched, which is the whole point of a scope.
    expect(await tagsOf("1")).toEqual(["green", "blue"]);
  });

  it("unjoins it again", async () => {
    await join("1", "detach", [10]);
    expect(await tagsOf("1")).toEqual(["blue"]);
  });

  it("takes a second press without complaining, either way", async () => {
    // Which is what a reader does. Attaching what is attached and detaching
    // what is not are the same request twice, and neither is an error.
    await join("1", "attach", [10]);
    await join("1", "attach", [10]);
    expect(await tagsOf("1")).toEqual(["green", "blue"]);

    await join("3", "detach", [10]);
    expect(await tagsOf("3")).toEqual([]);
  });

  it("refuses a key that is not a row, and writes nothing", async () => {
    // Refused the same way a forbidden one is: a caller must not be able to map
    // the table by watching which of its guesses succeed.
    expect((await join("3", "attach", [999])).status).toBe(404);
    expect(await tagsOf("3")).toEqual([]);
  });

  it("refuses a body that names nothing it could act on", async () => {
    const response = await fetch(`${url}/admin/api/posts/1/relations/tags/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: "10" }),
    });
    expect(response.status).toBe(404);
  });

  it("reads the rows it was given in one query, not one each", async () => {
    // A verb given fifty rows is a verb somebody will give five hundred, and a
    // check written a row at a time turns one request into five hundred round
    // trips. Counted rather than intended, like every other read here.
    asked.length = 0;
    reads.length = 0;
    await join("3", "attach", [10, 11, 12]);
    const touched =
      asked.filter((one) => one.model === "Tag").length +
      reads.filter((one) => one === "Tag").length;

    expect(touched).toBeLessThanOrEqual(1);
  });

  it("is refused where the manager's policy says so, one verb at a time", async () => {
    // Their own verbs, and separately: being allowed to put somebody on a
    // project is not being allowed to take them off it, and neither has
    // anything to do with creating or deleting one.
    tagsPolicy = { attach: () => false };
    expect((await join("3", "attach", [12])).status).toBe(404);
    expect(await tagsOf("3")).toEqual([]);
    expect((await join("1", "detach", [10])).status).toBe(200);
  });

  it("is refused for detaching where that is what the policy names", async () => {
    tagsPolicy = { detach: () => false };
    expect((await join("1", "detach", [10])).status).toBe(404);
    expect(await tagsOf("1")).toEqual(["green", "blue"]);
    expect((await join("3", "attach", [12])).status).toBe(200);
  });

  it("refuses a list longer than anything a reader could have chosen", async () => {
    // Every key a real row, so what is refused is the length and nothing else.
    // With keys that were not rows this would answer 404 either way, and the
    // cap could be deleted without a word.
    const many = Array.from({ length: 501 }, () => 10);
    expect((await join("1", "attach", many)).status).toBe(404);

    // One under the cap, and the same keys, goes through.
    const enough = Array.from({ length: 500 }, () => 10);
    expect((await join("1", "attach", enough)).status).toBe(200);
  });

  it("does nothing at all for an empty list", async () => {
    const answer = await join("1", "attach", []);
    expect(answer.body["named"]).toBe(0);
    expect(await tagsOf("1")).toEqual(["green", "blue"]);
  });

  it("refuses both verbs on a relation that has a column of its own", async () => {
    // An owned relation puts a row under a parent by writing it. There is
    // nothing to join, and the boot says so — this is the door.
    const response = await fetch(`${url}/admin/api/posts/1/relations/comments/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [1] }),
    });
    expect(response.status).toBe(404);
  });
});
