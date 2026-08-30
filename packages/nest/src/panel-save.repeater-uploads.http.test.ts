/**
 * An attachment that lives in a repeater row.
 *
 * `commit-uploads.ts` deals in columns, addressed by the name a field declares.
 * A `FileUpload` inside a repeater is not a column and is not at its own name:
 * its value sits at `items.<key>.attachment`, and its row is written through
 * the relation rather than the set. Everything the commit does for a column —
 * moving the file out of staging, writing the final key, dropping what was
 * replaced — has to happen there too, or the file is left in staging for the
 * sweep to delete and the row points at a key that is already gone.
 *
 * And a row can be deleted, which a column cannot. The attachment goes with it.
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
  StagedFile,
  StorageAdapter,
  WriteTree,
} from "@perchjs/core";
import { FileUpload, Repeater, Schema, TextInput } from "@perchjs/core";
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

/** A row of the repeater, and the rows one of those holds in turn. */
const SECTION = model({
  name: "Section",
  dbName: "Section",
  fields: [key(), scalar("label"), scalar("file"), scalar("postId", { type: "Int" })],
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
    {
      name: "blocks",
      type: "many",
      targetModel: "Block",
      relationName: "BlockToSection",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
  ],
});

const BLOCK = model({
  name: "Block",
  dbName: "Block",
  fields: [key(), scalar("file"), scalar("sectionId", { type: "Int" })],
  labelField: "file",
  relations: [
    {
      name: "section",
      type: "one",
      targetModel: "Section",
      relationName: "BlockToSection",
      foreignKeyFields: ["sectionId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
});

interface Block extends Row {
  readonly id: number;
  readonly file: string;
}

interface Section extends Row {
  readonly id: number;
  readonly label: string;
  readonly file: string;
  readonly blocks: readonly Block[];
}

let posts: Row[] = [];
let sections: Section[] = [];
let nextSection = 1;

/** Every move the disk was asked to make, in order. */
let events: string[] = [];

class Disk implements StorageAdapter {
  stage(): Promise<StagedFile> {
    throw new Error("not needed here");
  }
  commit(key: string, directory: string): Promise<string> {
    events.push(`commit ${key}`);
    return Promise.resolve(`${directory}/${key.replace("staging/", "")}`);
  }
  remove(keys: readonly string[]): Promise<void> {
    events.push(`remove ${[...keys].sort().join(",")}`);
    return Promise.resolve();
  }
  url(key: string): string {
    return key;
  }
  sweepStaged(): Promise<number> {
    return Promise.resolve(0);
  }
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [META, SECTION, BLOCK] };
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
    return Promise.resolve({ ...post, sections: [...sections] });
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    const row = { id: posts.length + 1, ...data.set };
    posts.push(row);
    this.#writeRelations(data);
    return Promise.resolve(row);
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    const at = posts.findIndex((row) => row["id"] === id);
    const row = { ...posts[at], ...data.set };
    posts[at] = row;
    this.#writeRelations(data);
    return Promise.resolve(row);
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
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  #writeRelations(data: WriteTree): void {
    for (const write of Object.values(data.relations ?? {})) {
      this.#writeRelation(write);
    }
  }

  #writeRelation(write: RelationWrite): void {
    for (const nested of write.create ?? []) {
      sections.push({
        id: nextSection++,
        // A value that is not text would be a shape the real adapter refuses;
        // stringifying it here would hide that.
        label: text(nested.set?.["label"]),
        file: text(nested.set?.["file"]),
        blocks: [],
      });
    }
    for (const { id, data } of write.update ?? []) {
      const at = sections.findIndex((section) => section.id === id);
      if (at !== -1) sections[at] = { ...sections[at], ...data.set } as Section;
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
        .schema([
          TextInput.make("label"),
          FileUpload.make("file").directory("files"),
          // A row inside a row: deleting the one above takes this with it, and
          // nothing outside the record can name the file it points at.
          Repeater.make("blocks").schema([FileUpload.make("file").directory("blocks")]),
        ]),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-rep-up-"));
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
    {
      id: 10,
      label: "First",
      file: "files/old",
      blocks: [{ id: 100, file: "blocks/old" }],
    },
  ];
  nextSection = 11;
  events = [];

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        disks: { default: new Disk() },
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

describe("a file chosen in a repeater row", () => {
  it("is moved out of staging, like one chosen in a column", async () => {
    await save({
      title: "Post",
      items: ["10", "new"],
      "items.10.label": "First",
      "items.10.file": "files/old",
      "items.new.label": "Second",
      "items.new.file": "staging/9",
    });

    expect(events).toContain("commit staging/9");
  });

  it("is written by its final key, not the staging one the sweep deletes", async () => {
    await save({
      title: "Post",
      items: ["10", "new"],
      "items.10.label": "First",
      "items.10.file": "files/old",
      "items.new.label": "Second",
      "items.new.file": "staging/9",
    });

    expect(sections.map((section) => section.file)).toEqual(["files/old", "files/9"]);
  });
});

describe("a file replaced in a repeater row", () => {
  it("drops the one the row no longer points at", async () => {
    await save({
      title: "Post",
      items: ["10"],
      "items.10.label": "First",
      "items.10.file": "staging/9",
    });

    // Exactly one move and one release: the row that changed, and nothing that
    // did not. The row inside it was not touched, and its file stays.
    expect(events).toEqual(["commit staging/9", "remove files/old"]);
  });
});

describe("a repeater row that was deleted", () => {
  it("takes its attachment with it", async () => {
    // Nothing points at the file once the row is gone, and no column ever did:
    // dropping what a column replaced would never reach this one.
    await save({ title: "Post", items: [] });

    expect(sections).toEqual([]);
    expect(events).toEqual(["remove blocks/old,files/old"]);
  });

  it("takes the attachments of the rows inside it too", async () => {
    // The row inside the deleted one is deleted by the database, which says
    // nothing about its file. Reachable only through the record, and only as
    // deep as the record was loaded.
    await save({ title: "Post", items: [] });

    expect(events.join(" ")).toContain("blocks/old");
  });
});
