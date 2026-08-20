/**
 * Reader tests, plus the contract test: the DMMF is not a stable public API of
 * Prisma, so a change in its shape must fail loudly here rather than quietly
 * produce a wrong IR.
 */
import { describe, expect, it } from "vitest";
import { findField, findModel, findRelation } from "@perchjs/core";
import { DmmfContractError, readDmmf } from "./dmmf-reader.js";
import { FIXTURE_DMMF, FIXTURE_MODEL_COUNT } from "./__fixtures__/dmmf.js";

const ir = readDmmf(FIXTURE_DMMF);

/** A DMMF field with the flags this file's inline models do not care about. */
function scalarField(over: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "scalar",
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefaultValue: false,
    ...over,
  };
}

describe("readDmmf — a twelve-model schema, read whole", () => {
  it("reads a twelve-model schema with 1-1, 1-n and n-n relations", () => {
    expect(FIXTURE_MODEL_COUNT).toBeGreaterThanOrEqual(12);
    expect(ir.models).toHaveLength(FIXTURE_MODEL_COUNT);
    for (const model of ir.models) {
      expect(model.primaryKey.isId, `${model.name} has a primary key`).toBe(true);
    }
  });

  it("keeps the database name distinct from the model name", () => {
    expect(findModel(ir, "User")?.dbName).toBe("users");
    expect(findModel(ir, "OrderLine")?.dbName).toBe("order_lines");
  });

  it("splits scalars from relations", () => {
    const post = findModel(ir, "Post");
    expect(post?.fields.map((f) => f.name)).not.toContain("author");
    expect(post?.relations.map((r) => r.name)).toContain("author");
  });
});

describe("readDmmf — field metadata", () => {
  it("reads maxLength from @db.VarChar", () => {
    expect(findField(findModel(ir, "User")!, "email")?.maxLength).toBe(255);
    expect(findField(findModel(ir, "User")!, "name")?.maxLength).toBe(120);
  });

  it("reads precision and scale from @db.Decimal", () => {
    const price = findField(findModel(ir, "Product")!, "price");
    expect(price?.precision).toBe(10);
    expect(price?.scale).toBe(2);
  });

  it("flags @db.Text as long text", () => {
    expect(findField(findModel(ir, "User")!, "bio")?.isLongText).toBe(true);
    expect(findField(findModel(ir, "User")!, "email")?.isLongText).toBe(false);
  });

  it("treats @updatedAt as read-only even though the DMMF does not", () => {
    // The trap this guards: isReadOnly is false on @updatedAt, yet the database
    // owns the value and a form must never send it.
    const updatedAt = findField(findModel(ir, "User")!, "updatedAt");
    expect(updatedAt?.isReadOnly).toBe(true);
  });

  it("disagrees with Prisma's read-only, and that is the decision", () => {
    // Prisma marks the column a relation owns; the IR marks the value the
    // database owns. They disagree on both of these, and the disagreement is
    // deliberate — a foreign key is kept out of a form by its relation, not by
    // this flag.
    expect(findField(findModel(ir, "Post")!, "authorId")?.isReadOnly).toBe(false);
    expect(findField(findModel(ir, "Post")!, "id")?.isReadOnly).toBe(true);
  });

  it("reads a generated default as owned, and a literal as offered", () => {
    // `@default(now())` is the database supplying a value nobody types;
    // `@default(true)` is a value the form may perfectly well send instead.
    const User = findModel(ir, "User")!;

    expect(findField(User, "createdAt")?.isReadOnly).toBe(true);
    expect(findField(User, "isActive")?.isReadOnly).toBe(false);
    expect(findField(User, "role")?.isReadOnly).toBe(false);
    expect(findField(User, "email")?.isReadOnly).toBe(false);
  });

  it("offers a scalar list whose default is an empty list", () => {
    // `@default([])` arrives as `[]` — an object, like a function default, and
    // unlike one it carries no name. Without that distinction the field would
    // read as database-owned and vanish from the form.
    const listy = readDmmf({
      datamodel: {
        enums: [],
        models: [
          {
            name: "Thing",
            fields: [
              scalarField({ name: "id", type: "Int", isId: true, isUnique: true }),
              scalarField({
                name: "tags",
                type: "String",
                isList: true,
                hasDefaultValue: true,
                default: [],
              }),
            ],
          },
        ],
      },
    });

    expect(findField(findModel(listy, "Thing")!, "tags")?.isReadOnly).toBe(false);
  });

  it("resolves enum values through datamodel.enums", () => {
    const role = findField(findModel(ir, "User")!, "role");
    expect(role?.kind).toBe("enum");
    expect(role?.enumValues).toEqual(["ADMIN", "EDITOR", "VIEWER"]);
  });

  it("carries /// documentation", () => {
    expect(findField(findModel(ir, "User")!, "email")?.documentation).toBe(
      "Used to sign in. Must be unique.",
    );
    expect(findModel(ir, "User")?.documentation).toBe("Someone who can sign in.");
  });

  it("marks a Json field as json rather than scalar", () => {
    expect(findField(findModel(ir, "User")!, "preferences")?.kind).toBe("json");
  });
});

describe("readDmmf — relations", () => {
  it("reads a to-one relation with its foreign key and onDelete", () => {
    const author = findRelation(findModel(ir, "Post")!, "author");
    expect(author).toMatchObject({
      type: "one",
      targetModel: "User",
      foreignKeyFields: ["authorId"],
      referencedFields: ["id"],
      isRequired: true,
      onDelete: "Cascade",
    });
  });

  it("reads a to-many relation as never required", () => {
    const posts = findRelation(findModel(ir, "User")!, "posts");
    expect(posts?.type).toBe("many");
    expect(posts?.isRequired).toBe(false);
  });

  it("reads an optional to-one relation", () => {
    expect(findRelation(findModel(ir, "Post")!, "category")?.isRequired).toBe(false);
  });

  it("carries the name both halves of a relation share", () => {
    // What pairs a to-many with the to-one holding its column. Read from the
    // DMMF rather than rebuilt from the field's own name, which would differ on
    // the two sides and pair nothing.
    const posts = findRelation(findModel(ir, "User")!, "posts");
    const author = findRelation(findModel(ir, "Post")!, "author");

    expect(posts?.relationName).toBe("PostToUser");
    expect(author?.relationName).toBe(posts?.relationName);
  });
});

describe("readDmmf — model-level metadata", () => {
  it("detects soft delete from the deletedAt convention", () => {
    expect(findModel(ir, "User")?.hasSoftDelete).toBe(true);
    expect(findModel(ir, "Post")?.hasSoftDelete).toBe(false);
  });

  it("lets configuration override the convention", () => {
    const overridden = readDmmf(FIXTURE_DMMF, { softDelete: { User: false } });
    expect(findModel(overridden, "User")?.hasSoftDelete).toBe(false);
  });

  it("collects composite unique constraints alongside single-field ones", () => {
    const post = findModel(ir, "Post");
    expect(post?.uniqueConstraints).toContainEqual(["authorId", "slug"]);
    expect(post?.uniqueConstraints).toContainEqual(["slug"]);
    expect(post?.uniqueConstraints).toContainEqual(["id"]);
  });

  it("resolves the label field by the documented priority order", () => {
    expect(findModel(ir, "User")?.labelField).toBe("name");
    expect(findModel(ir, "Tag")?.labelField).toBe("label");
    // No name, title, label, email or slug: falls back to the first unique String.
    expect(findModel(ir, "Order")?.labelField).toBe("reference");
    // Nothing at all: the primary key.
    expect(findModel(ir, "PostTag")?.labelField).toBe("id");
  });
});

describe("readDmmf — contract test", () => {
  it("rejects a DMMF that is not an object", () => {
    expect(() => readDmmf(null)).toThrow(DmmfContractError);
    expect(() => readDmmf("nope")).toThrow(DmmfContractError);
  });

  it("rejects a DMMF with no datamodel", () => {
    expect(() => readDmmf({})).toThrow(/no `datamodel` object/);
  });

  it("rejects a datamodel whose models or enums are not arrays", () => {
    expect(() => readDmmf({ datamodel: { models: {}, enums: [] } })).toThrow(
      /`datamodel.models` is not an array/,
    );
    expect(() => readDmmf({ datamodel: { models: [], enums: null } })).toThrow(
      /`datamodel.enums` is not an array/,
    );
  });

  it("names the model when a scalar type is unknown to the IR", () => {
    const dmmf = {
      datamodel: {
        enums: [],
        models: [
          {
            name: "Odd",
            fields: [
              {
                name: "id",
                kind: "scalar",
                type: "Int",
                isRequired: true,
                isList: false,
                isId: true,
                isUnique: true,
                isReadOnly: true,
                hasDefaultValue: true,
              },
              {
                name: "weird",
                kind: "scalar",
                type: "Geometry",
                isRequired: true,
                isList: false,
                isId: false,
                isUnique: false,
                isReadOnly: false,
                hasDefaultValue: false,
              },
            ],
          },
        ],
      },
    };
    expect(() => readDmmf(dmmf)).toThrow(/Odd\.weird has scalar type "Geometry"/);
  });

  it("names the model when an enum is missing from datamodel.enums", () => {
    const dmmf = {
      datamodel: {
        enums: [],
        models: [
          {
            name: "Ghost",
            fields: [
              {
                name: "id",
                kind: "scalar",
                type: "Int",
                isRequired: true,
                isList: false,
                isId: true,
                isUnique: true,
                isReadOnly: true,
                hasDefaultValue: true,
              },
              {
                name: "state",
                kind: "enum",
                type: "Missing",
                isRequired: true,
                isList: false,
                isId: false,
                isUnique: false,
                isReadOnly: false,
                hasDefaultValue: false,
              },
            ],
          },
        ],
      },
    };
    expect(() => readDmmf(dmmf)).toThrow(/Ghost\.state is an enum of type "Missing"/);
  });

  it("refuses a model with no single-field @id rather than guessing", () => {
    const dmmf = {
      datamodel: {
        enums: [],
        models: [{ name: "Keyless", fields: [], uniqueFields: [] }],
      },
    };
    expect(() => readDmmf(dmmf)).toThrow(/Keyless has no single-field @id/);
  });

  it("points at the one file to fix when the contract breaks", () => {
    // The message is part of the contract: whoever hits this on a Prisma upgrade
    // should not have to search for the blast radius.
    expect(() => readDmmf(null)).toThrow(/dmmf-reader\.ts/);
  });
});
