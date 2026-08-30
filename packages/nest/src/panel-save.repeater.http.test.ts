/**
 * A repeater, written over HTTP: milestone A3.
 *
 * Adding, editing, reordering and deleting rows in one transaction, with a
 * complete rollback on failure. Every other double in this repository writes
 * into a variable and calls that a transaction; this one takes a copy and puts
 * it back, because a rollback nothing can fail is not evidence of anything.
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
  RelationWrite,
  Row,
  Schema as SchemaTree,
  WriteTree,
} from "@perchjs/core";
import { Repeater, Schema, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const META = model({
  fields: [key(), scalar("title")],
  relations: [
    {
      name: "sections",
      type: "many",
      targetModel: "Section",
      relationName: "PostToSection",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
  ],
});

/** What the repeater's rows are: a model of their own, reached by a relation. */
const SECTION = model({
  name: "Section",
  dbName: "Section",
  fields: [key(), scalar("label"), scalar("postId", { type: "Int" })],
  labelField: "label",
  relations: [
    {
      name: "post",
      type: "one",
      targetModel: "Post",
      relationName: "PostToSection",
      foreignKeyFields: ["postId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
});

interface Section extends Row {
  readonly id: number;
  readonly label: string;
}

let posts: Row[] = [];
let sections: Section[] = [];
let nextSection = 1;
let refuse = false;

/**
 * Writes the relation, and can be put back the way it was.
 *
 * The rollback is the point. Prisma's nested write is one statement and rolls
 * back on its own; a `Map` does not, so a double that only ever succeeds would
 * let the criterion pass without anything having been shown.
 */
@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [META, SECTION] };
  }
  meta(): ModelMeta {
    return META;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: posts, total: posts.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    const post = posts.find((row) => row["id"] === id);
    if (post === undefined) return Promise.resolve(null);
    // The children come back with the row, which is what makes an update an
    // update: they are the only rows a key may reach.
    return Promise.resolve({ ...post, sections: sections.filter((s) => s.id !== 0) });
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    const row = { id: posts.length + 1, ...data.set };
    posts.push(row);
    this.#writeRelations(data);
    return Promise.resolve(row);
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    const at = posts.findIndex((row) => row["id"] === id);
    posts[at] = { ...posts[at], ...data.set };
    this.#writeRelations(data);
    return Promise.resolve(posts[at]);
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

  attach(): Promise<void> {
    return Promise.resolve();
  }
  detach(): Promise<void> {
    return Promise.resolve();
  }

  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    const before = { posts: [...posts], sections: [...sections], next: nextSection };
    try {
      return await fn(this);
    } catch (error) {
      posts = before.posts;
      sections = before.sections;
      nextSection = before.next;
      throw error;
    }
  }

  #writeRelations(data: WriteTree): void {
    for (const write of Object.values(data.relations ?? {})) {
      this.#writeRelation(write);
    }
  }

  #writeRelation(write: RelationWrite): void {
    for (const nested of write.create ?? []) {
      // A row's label is text or it is nothing; a double that stringified an
      // object would hide a shape the real adapter would have refused.
      const raw = nested.set?.["label"];
      const label = typeof raw === "string" ? raw : "";
      if (refuse && label === "boom") throw new Error("the database said no");
      sections.push({ id: nextSection++, label });
    }
    for (const { id, data } of write.update ?? []) {
      const at = sections.findIndex((section) => section.id === id);
      if (at !== -1) {
        sections[at] = { ...sections[at], ...data.set } as Section;
      }
    }
    for (const id of write.delete ?? []) {
      sections = sections.filter((section) => section.id !== id);
    }
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): SchemaTree {
    return Schema.make([
      TextInput.make("title"),
      Repeater.make("items")
        .relationship("sections")
        .schema([TextInput.make("label")]),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-repeater-"));
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

beforeEach(async () => {
  posts = [{ id: 1, title: "Post" }];
  sections = [
    { id: 10, label: "First" },
    { id: 11, label: "Second" },
  ];
  nextSection = 12;
  refuse = false;

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

const save = async (state: Record<string, unknown>): Promise<number> => {
  const response = await fetch(`${url}/admin/api/posts/1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return response.status;
};

const create = async (state: Record<string, unknown>): Promise<number> => {
  const response = await fetch(`${url}/admin/api/posts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return response.status;
};

const labels = (): string[] => sections.map((section) => section.label);

describe("editing a repeater over HTTP", () => {
  it("edits a row in place, by the key it was loaded with", async () => {
    expect(
      await save({
        title: "Post",
        items: ["10", "11"],
        "items.10.label": "Changed",
        "items.11.label": "Second",
      }),
    ).toBe(200);

    expect(labels()).toEqual(["Changed", "Second"]);
    expect(sections.map((s) => s.id)).toEqual([10, 11]);
  });

  it("adds a row without touching the ones that were there", async () => {
    await save({
      title: "Post",
      items: ["10", "11", "new"],
      "items.10.label": "First",
      "items.11.label": "Second",
      "items.new.label": "Third",
    });

    expect(labels()).toEqual(["First", "Second", "Third"]);
  });

  it("deletes a row the list stopped naming", async () => {
    await save({ title: "Post", items: ["10"], "items.10.label": "First" });

    expect(sections.map((s) => s.id)).toEqual([10]);
  });

  it("adds, edits and deletes in one request", async () => {
    await save({
      title: "Post",
      items: ["11", "new"],
      "items.11.label": "Kept and changed",
      "items.new.label": "Added",
    });

    expect(labels()).toEqual(["Kept and changed", "Added"]);
  });

  it("takes a reorder without moving a value onto another row", async () => {
    // The whole reason the key is stable rather than an index.
    await save({
      title: "Post",
      items: ["11", "10"],
      "items.10.label": "First",
      "items.11.label": "Second",
    });

    expect(sections.find((s) => s.id === 10)?.label).toBe("First");
    expect(sections.find((s) => s.id === 11)?.label).toBe("Second");
  });
});

describe("creating a row that already has rows of its own", () => {
  it("writes them with it, in the same request", async () => {
    expect(
      await create({
        title: "New",
        items: ["a", "b"],
        "items.a.label": "One",
        "items.b.label": "Two",
      }),
    ).toBe(200);

    expect(labels()).toEqual(["First", "Second", "One", "Two"]);
    expect(posts).toHaveLength(2);
  });

  it("leaves neither the row nor its rows behind when it fails", async () => {
    refuse = true;

    await create({ title: "New", items: ["b"], "items.b.label": "boom" });

    expect(posts).toHaveLength(1);
    expect(labels()).toEqual(["First", "Second"]);
  });
});

describe("a write that fails partway", () => {
  it("leaves the rows exactly as they were", async () => {
    // The criterion: a complete rollback. The second row is what throws, so
    // the first has already been written when it does.
    refuse = true;

    const status = await save({
      title: "Changed",
      items: ["10", "a", "b"],
      "items.10.label": "Edited",
      "items.a.label": "fine",
      "items.b.label": "boom",
    });

    expect(status).toBe(500);
    expect(labels()).toEqual(["First", "Second"]);
    expect(posts[0]?.["title"]).toBe("Post");
  });

  it("leaves nothing half-added when the very first row throws", async () => {
    refuse = true;

    await save({ title: "Post", items: ["b"], "items.b.label": "boom" });

    expect(sections.map((s) => s.id)).toEqual([10, 11]);
  });
});
