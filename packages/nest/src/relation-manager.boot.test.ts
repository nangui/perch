/**
 * What a relation manager is refused at boot.
 *
 * Both refusals here are about the one derived column. Every read and write a
 * manager makes is narrowed by it, so a manager that has none cannot be served
 * at all — and a form declaring it offers to move a child to another parent
 * while the server writes that column last, over whatever the form produced.
 *
 * Loud, and at boot, because both are lines of somebody's own declaration. A
 * page of the wrong rows and a select that does nothing are exactly the two
 * failures nobody notices from the outside.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Ir, ModelMeta, Row } from "@perchjs/core";
import {
  CreateAction,
  DeleteAction,
  EditAction,
  FileUpload,
  Repeater,
  Schema,
  Select,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { describe, expect, it } from "vitest";
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
      name: "replies",
      type: "many",
      targetModel: "Reply",
      relationName: "CommentToReply",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
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

/** What a repeater inside a manager's form writes: a third model's columns. */
const REPLY: ModelMeta = model({
  name: "Reply",
  dbName: "Reply",
  fields: [
    key(),
    scalar("postId", { type: "Int" }),
    scalar("commentId", { type: "Int" }),
  ],
  labelField: "postId",
  relations: [
    {
      name: "comment",
      type: "one",
      targetModel: "Comment",
      relationName: "CommentToReply",
      foreignKeyFields: ["commentId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
});

const POST: ModelMeta = model({
  fields: [key(), scalar("title"), scalar("pinnedId", { type: "Int" })],
  relations: [
    {
      name: "pinned",
      type: "one",
      targetModel: "Comment",
      relationName: "PostPinnedComment",
      foreignKeyFields: ["pinnedId"],
      referencedFields: ["id"],
      isRequired: false,
      isList: false,
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

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, COMMENT, REPLY] };
  }
  meta(name: string): ModelMeta {
    return name === "Comment" ? COMMENT : POST;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    throw new Error("not needed here");
  }
  findOne(): Promise<Row | null> {
    throw new Error("not needed here");
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

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-manager-boot-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

/** Boots a panel whose one resource declares `managers`, or reports why not. */
async function boot(managers: readonly RelationManager[]): Promise<void> {
  @PanelResource({ model: "Post", slug: "posts" })
  class PostResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
    relations(): readonly RelationManager[] {
      return managers;
    }
  }

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
  await moduleRef.init();
  await moduleRef.close();
}

const comments = (): RelationManager =>
  RelationManager.make("comments").table((table) =>
    table.columns([TextColumn.make("body")]),
  );

describe("a manager the server can narrow", () => {
  it("boots", async () => {
    await expect(
      boot([comments().form((schema) => schema.schema([TextInput.make("body")]))]),
    ).resolves.toBeUndefined();
  });
});

describe("a manager the server cannot narrow", () => {
  it("stops the boot when the relation is not there", async () => {
    await expect(boot([RelationManager.make("nothing")])).rejects.toThrow(
      /no relation named `nothing`/,
    );
  });

  it("stops the boot when the relation holds one row", async () => {
    // A to-one belongs in the form as a `Select`; there is no list to page.
    await expect(boot([RelationManager.make("pinned")])).rejects.toThrow(
      /holds one row, not many/,
    );
  });
});

describe("a manager action the client could only draw as a link", () => {
  it("stops the boot, because a child has no page to link to", async () => {
    await expect(boot([comments().actions([EditAction.make()])])).rejects.toThrow(
      "comments.EditAction",
    );
  });

  it("says so about a header action too", async () => {
    await expect(
      boot([comments().headerActions([CreateAction.make()])]),
    ).rejects.toThrow("is a link to a page a child does not have");
  });

  it("leaves an action the server carries out alone", async () => {
    await expect(
      boot([comments().actions([DeleteAction.make()])]),
    ).resolves.toBeUndefined();
  });
});

describe("a manager form naming a disk the panel has not", () => {
  it("stops the boot, the way the resource's own form does", async () => {
    await expect(
      boot([
        comments().form((schema) =>
          schema.schema([FileUpload.make("body").disk("nowhere")]),
        ),
      ]),
    ).rejects.toThrow(/names the disk `nowhere`/);
  });
});

describe("a manager form writing a column the child has not", () => {
  it("stops the boot, judged against the child rather than the parent", async () => {
    // `title` is the parent's column. Reached through a parent changes nothing
    // about which model the write lands on.
    await expect(
      boot([comments().form((schema) => schema.schema([TextInput.make("title")]))]),
    ).rejects.toThrow("`title` is a field on `Comment`");
  });
});

describe("a manager form reaching for the parent column", () => {
  it("stops the boot, whatever field declares it", async () => {
    await expect(
      boot([
        comments().form((schema) =>
          schema.schema([
            TextInput.make("body"),
            Select.make("postId").relationship("post", "title"),
          ]),
        ),
      ]),
    ).rejects.toThrow(/comments\.postId/);
  });

  it("leaves a repeater's rows alone, whose columns are a third model's", async () => {
    // `postId` down there names a column of whatever the repeater writes, and
    // refusing it would refuse a form that is right.
    await expect(
      boot([
        comments().form((schema) =>
          schema.schema([Repeater.make("replies").schema([TextInput.make("postId")])]),
        ),
      ]),
    ).resolves.toBeUndefined();
  });

  it("says the server fills it, rather than that it is unknown", async () => {
    await expect(
      boot([comments().form((schema) => schema.schema([TextInput.make("postId")]))]),
    ).rejects.toThrow(/fills it from the address/);
  });
});
