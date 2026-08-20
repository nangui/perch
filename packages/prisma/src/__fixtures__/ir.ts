/**
 * A small IR, written by hand.
 *
 * The adapter takes an IR and knows nothing about where it came from, so its
 * tests build one directly rather than reading a DMMF through the generator.
 * That reading has its own package and its own contract test; borrowing it here
 * would point an arrow from the adapter back at a build-time tool.
 */
import type { FieldMeta, Ir, ModelMeta, RelationMeta } from "@perchjs/core";

function field(name: string, over: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name,
    kind: "scalar",
    type: "String",
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefault: false,
    isLongText: false,
    ...over,
  };
}

const id = (name = "id"): FieldMeta =>
  field(name, { type: "Int", isId: true, isUnique: true, isReadOnly: true });

/** The name Prisma gives a relation nobody named: the two models, in order. */
function pair(owner: string, targetModel: string): string {
  return [owner, targetModel].sort().join("To");
}

function toMany(owner: string, name: string, targetModel: string): RelationMeta {
  return {
    name,
    type: "many",
    targetModel,
    relationName: pair(owner, targetModel),
    foreignKeyFields: [],
    referencedFields: [],
    isRequired: false,
    isList: true,
  };
}

function toOne(
  owner: string,
  name: string,
  targetModel: string,
  fk: string,
): RelationMeta {
  return {
    name,
    type: "one",
    targetModel,
    relationName: pair(owner, targetModel),
    foreignKeyFields: [fk],
    referencedFields: ["id"],
    isRequired: true,
    isList: false,
  };
}

function model(over: Partial<ModelMeta> & { name: string }): ModelMeta {
  const fields = over.fields ?? [id()];
  const primaryKey = fields.find((f) => f.isId) ?? id();
  return {
    dbName: over.name.toLowerCase(),
    primaryKey,
    relations: [],
    uniqueConstraints: [[primaryKey.name]],
    hasSoftDelete: false,
    labelField: primaryKey.name,
    ...over,
    fields,
  };
}

export const FIXTURE_IR: Ir = {
  models: [
    model({
      name: "User",
      fields: [id(), field("email", { isUnique: true }), field("name")],
      relations: [
        toMany("User", "posts", "Post"),
        toMany("User", "orders", "Order"),
        toMany("User", "notes", "Note"),
      ],
      labelField: "name",
    }),
    model({
      name: "Post",
      fields: [id(), field("title"), field("authorId", { type: "Int" })],
      relations: [
        toOne("Post", "author", "User", "authorId"),
        toMany("Post", "comments", "Comment"),
      ],
      labelField: "title",
    }),
    model({
      name: "Comment",
      fields: [id(), field("body")],
      labelField: "body",
    }),
    // A soft-deleting model, so the adapter can be asked what it does with one.
    model({
      name: "Note",
      fields: [id(), field("body"), field("deletedAt", { type: "DateTime" })],
      hasSoftDelete: true,
      labelField: "body",
    }),
  ],
};
