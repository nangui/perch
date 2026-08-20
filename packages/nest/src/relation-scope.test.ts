/**
 * Which children belong to which parent, worked out once.
 *
 * A security boundary rather than a convenience: every read and every write a
 * manager makes is narrowed by this column, so the wrong one is a page of
 * somebody else's rows and a create that hands a child to the wrong owner.
 */
import type { Ir, ModelMeta } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import { CreateAction, EditAction, TextColumn, TextInput } from "@perchjs/core";
import { RelationManager } from "./relation-manager.js";
import { relationScope, ScopeError } from "./relation-scope.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const toOne = (name: string, target: string, fk: string) => ({
  name,
  type: "one" as const,
  targetModel: target,
  foreignKeyFields: [fk],
  referencedFields: ["id"],
  isRequired: true,
  isList: false,
});

const toMany = (name: string, target: string) => ({
  name,
  type: "many" as const,
  targetModel: target,
  foreignKeyFields: [],
  referencedFields: [],
  isRequired: false,
  isList: true,
});

const ir = (models: readonly ModelMeta[]): Ir => ({ models });

const POST = model({
  name: "Post",
  dbName: "Post",
  fields: [key(), scalar("title")],
  relations: [toMany("comments", "Comment")],
});

const COMMENT = model({
  name: "Comment",
  dbName: "Comment",
  fields: [key(), scalar("body"), scalar("postId", { type: "Int" })],
  relations: [toOne("post", "Post", "postId")],
});

describe("the column that narrows a manager to one parent", () => {
  it("is read off the child, because the parent's side holds none", () => {
    // Measured against the generated IR before this existed: a to-many records
    // no foreign key, and the model pointing back is the one that owns it.
    expect(POST.relations[0]?.foreignKeyFields).toEqual([]);

    expect(relationScope(ir([POST, COMMENT]), "Post", "comments")).toEqual({
      model: "Comment",
      foreignKey: "postId",
      parentKey: "id",
    });
  });

  it("names the parent column it points at, not the primary key by assumption", () => {
    const byCode = model({
      name: "Tag",
      dbName: "Tag",
      fields: [key(), scalar("postCode")],
      relations: [
        {
          ...toOne("post", "Post", "postCode"),
          referencedFields: ["code"],
        },
      ],
    });

    expect(
      relationScope(
        ir([{ ...POST, relations: [toMany("tags", "Tag")] }, byCode]),
        "Post",
        "tags",
      ).parentKey,
    ).toBe("code");
  });
});

describe("a scope that cannot be worked out", () => {
  it("refuses a relation the parent does not have", () => {
    expect(() => relationScope(ir([POST, COMMENT]), "Post", "nope")).toThrow(
      ScopeError,
    );
  });

  it("refuses a to-one, which belongs in the form rather than beside it", () => {
    const holder = model({
      name: "Post",
      dbName: "Post",
      fields: [key()],
      relations: [toOne("author", "Comment", "authorId")],
    });

    expect(() => relationScope(ir([holder, COMMENT]), "Post", "author")).toThrow(
      /holds one row/,
    );
  });

  it("refuses one with no way back, which is what a join looks like from here", () => {
    const loose = model({ name: "Comment", dbName: "Comment", fields: [key()] });

    expect(() => relationScope(ir([POST, loose]), "Post", "comments")).toThrow(
      /no column holding a/,
    );
  });

  it("refuses two ways back rather than picking one", () => {
    // Two possible pages, and the wrong one looks exactly like the right one.
    const twice = model({
      name: "Comment",
      dbName: "Comment",
      fields: [
        key(),
        scalar("postId", { type: "Int" }),
        scalar("editedPostId", { type: "Int" }),
      ],
      relations: [
        toOne("post", "Post", "postId"),
        toOne("editedPost", "Post", "editedPostId"),
      ],
    });

    expect(() => relationScope(ir([POST, twice]), "Post", "comments")).toThrow(
      /more than once/,
    );
  });
});

describe("a manager on a resource", () => {
  it("shapes its own table and form rather than sharing the resource's", () => {
    const manager = RelationManager.make("comments")
      .label("Notes")
      .table((table) => table.columns([TextColumn.make("body")]))
      .form((schema) => schema.schema([TextInput.make("body").required()]))
      .actions([EditAction.make()])
      .headerActions([CreateAction.make()]);

    expect(manager.state.label).toBe("Notes");
    expect(manager.state.table.state.columns.map((one) => one.state.path)).toEqual([
      "body",
    ]);
    expect(manager.state.table.state.actions.map((one) => one.type)).toEqual([
      "EditAction",
    ]);
    expect(manager.state.form?.children.length).toBe(1);
  });

  it("clones on every call, like every other builder here", () => {
    // A builder shared between requests leaks one reader's state into another's.
    const plain = RelationManager.make("comments");
    const named = plain.label("Notes");

    expect(named).not.toBe(plain);
    expect(plain.state.label).toBeUndefined();
  });

  it("does neither create nor edit without a form", () => {
    expect(RelationManager.make("comments").state.form).toBeUndefined();
  });

  it("says when its rows are joined rather than owned", () => {
    // No column to fill, so a different verb set: attach and detach.
    expect(RelationManager.make("tags").attachable().state.attachable).toBe(true);
  });
});
