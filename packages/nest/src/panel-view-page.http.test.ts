/**
 * `GET {path}/:resource/:id` — the View page, over HTTP.
 *
 * Four things it owes, and they are the ones a read-only page gets wrong:
 * the record is loaded before the policy is asked about it, a refusal is a 404
 * like every other refusal here, an entry authorization hid is not in the page
 * at all, and the relations the entries name cost one query rather than one
 * each.
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
  IncludePlan,
  Ir,
  ModelMeta,
  Row,
  Schema as SchemaTree,
} from "@perchjs/core";
import { RepeatableEntry, Schema, Section, TextEntry, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const AUTHOR: ModelMeta = model({
  name: "Author",
  dbName: "Author",
  fields: [key(), scalar("name")],
  labelField: "name",
});

const TAG: ModelMeta = model({
  name: "Tag",
  dbName: "Tag",
  fields: [key(), scalar("name")],
  labelField: "name",
});

const NOTE: ModelMeta = model({
  name: "Note",
  dbName: "Note",
  fields: [key(), scalar("body")],
  labelField: "body",
  relations: [
    {
      name: "tags",
      type: "many",
      targetModel: "Tag",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
  ],
});

const POST: ModelMeta = model({
  fields: [
    key(),
    scalar("title"),
    scalar("secret"),
    scalar("authorId", { type: "Int" }),
  ],
  relations: [
    {
      name: "notes",
      type: "many",
      targetModel: "Note",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
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
});

/** Twenty, which is the number the infolist criterion names. */
const NOTES: Row[] = Array.from({ length: 20 }, (_, at) => ({
  id: at + 1,
  body: `Note ${String(at + 1)}`,
}));

const ROW: Row = { id: 1, title: "Ada", secret: "not on the page" };
const AUTHOR_ROW: Row = { id: 9, name: "Grace" };

/** Every read the page made, so the query count is measured rather than argued. */
let reads: { model: string; include?: IncludePlan }[] = [];
let policy: Authorization | undefined;

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, AUTHOR, NOTE, TAG] };
  }
  meta(name: string): ModelMeta {
    if (name === "Author") return AUTHOR;
    if (name === "Tag") return TAG;
    return name === "Note" ? NOTE : POST;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    reads.push({ model: "many" });
    return Promise.resolve({ rows: [ROW], total: 1 });
  }
  findOne(name: string, id: Id, include?: IncludePlan): Promise<Row | null> {
    reads.push({ model: name, ...(include === undefined ? {} : { include }) });
    if (id !== 1) return Promise.resolve(null);
    // Only what was asked for. A double that hands back the relation either way
    // lets a page that never planned to load it pass here and show nothing in
    // front of a reader.
    return Promise.resolve({
      ...ROW,
      ...(include?.["author"] === true ? { author: AUTHOR_ROW } : {}),
      ...(include?.["notes"] === undefined ? {} : { notes: NOTES }),
    });
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
  get can(): Authorization | undefined {
    return policy;
  }
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
  infolist(): SchemaTree {
    return Schema.make([
      Section.make("Details").schema([
        TextEntry.make("title").label("Title"),
        // Through a relation: this is what the loading plan is for.
        TextEntry.make("author.name").label("Author"),
        // Hidden, and therefore not in the page at all.
        TextEntry.make("secret").hidden(),
      ]),
      RepeatableEntry.make("notes").schema([
        TextEntry.make("body").label("Note"),
        // A row that holds rows. Its relation has to reach the plan too, or it
        // draws as an empty section on a page that otherwise looks right.
        RepeatableEntry.make("tags").schema([TextEntry.make("name").label("Tag")]),
      ]),
    ]);
  }
}

/** No infolist at all, which is what decides there is no View page. */
@PanelResource({ model: "Post", slug: "plain" })
class PlainResource {
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-view-"));
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
  reads = [];
  policy = undefined;
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource, PlainResource],
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

const page = async (at: string): Promise<{ status: number; body: string }> => {
  const response = await fetch(`${url}${at}`);
  return { status: response.status, body: await response.text() };
};

describe("the View page", () => {
  it("draws what the entries name", async () => {
    const { status, body } = await page("/admin/posts/1");

    expect(status).toBe(200);
    expect(body).toContain("Ada");
    expect(body).toContain("Grace");
  });

  it("says it is a view, so the browser does not draw it as a form", async () => {
    expect((await page("/admin/posts/1")).body).toContain('data-operation="view"');
  });

  it("is named by the row rather than by the address", async () => {
    // `Post 1` reads the URL back at the reader. The label field is what a
    // human calls the thing.
    expect((await page("/admin/posts/1")).body).toContain("<title>Ada");
  });

  it("sends no state, because an entry reads the record", async () => {
    const { body } = await page("/admin/posts/1");

    expect(body).toContain("&quot;state&quot;:{}");
  });
});

describe("what the View page does not send", () => {
  it("leaves out an entry that is not visible, value and all", async () => {
    const { body } = await page("/admin/posts/1");

    expect(body).not.toContain("not on the page");
    expect(body).not.toContain("secret");
  });
});

describe("who may read it", () => {
  it("is refused per record, by the policy for viewing", async () => {
    policy = { view: () => false };

    expect((await page("/admin/posts/1")).status).toBe(404);
  });

  it("asks that policy only once the row is in hand", async () => {
    // A rule written about a record cannot be honoured without one, and asking
    // before would be authorising at render time.
    policy = { view: (_user, record) => (record as Row)["title"] === "Ada" };

    expect((await page("/admin/posts/1")).status).toBe(200);
  });

  it("says 404 for a refusal, like every other refusal here", async () => {
    policy = { view: () => false };

    const refused = await page("/admin/posts/1");
    const missing = await page("/admin/posts/404");

    expect(refused.status).toBe(missing.status);
  });

  it("is refused before the record is read where the resource itself is barred", async () => {
    policy = { viewAny: () => false };

    expect((await page("/admin/posts/1")).status).toBe(404);
  });
});

describe("a resource with no infolist", () => {
  it("has no View page, and says so the way a missing one does", async () => {
    expect((await page("/admin/plain/1")).status).toBe(404);
  });
});

describe("what the page costs", () => {
  it("reads the row once, with the relations its entries name", async () => {
    await page("/admin/posts/1");

    expect(reads).toEqual([
      { model: "Post", include: { author: true, notes: { tags: true } } },
    ]);
  });

  it("costs the same with twenty child rows as it would with one", async () => {
    // The criterion an infolist is accepted on. A page that asked per row would
    // still look right and would be twenty-one queries.
    await page("/admin/posts/1");

    expect(reads.length).toBe(1);
  });

  it("draws all twenty of them, so the count is not a count of nothing", async () => {
    expect((await page("/admin/posts/1")).body).toContain("Note 20");
  });
});

describe("the routes it must not swallow", () => {
  it("leaves the create page alone", async () => {
    expect((await page("/admin/posts/create")).status).toBe(200);
  });

  it("leaves the edit page alone", async () => {
    expect((await page("/admin/posts/1/edit")).status).toBe(200);
  });
});
