import { describe, expect, it } from "vitest";
import type { FieldMeta, ModelMeta, RelationMeta, Ir } from "./ir.js";
import { buildIncludePlan, PathError, readPath, resolvePath } from "./path.js";

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

function relation(
  name: string,
  targetModel: string,
  over: Partial<RelationMeta> = {},
): RelationMeta {
  return {
    name,
    type: "one",
    targetModel,
    relationName: `${targetModel}To${name}`,
    foreignKeyFields: [`${name}Id`],
    referencedFields: ["id"],
    isRequired: true,
    isList: false,
    ...over,
  };
}

function model(
  name: string,
  fields: FieldMeta[],
  relations: RelationMeta[] = [],
): ModelMeta {
  const pk = fields.find((f) => f.isId) ?? field("id", { isId: true, isUnique: true });
  return {
    name,
    dbName: name.toLowerCase(),
    primaryKey: pk,
    fields,
    relations,
    uniqueConstraints: [[pk.name]],
    hasSoftDelete: false,
    labelField: "name",
  };
}

const ir: Ir = {
  models: [
    model(
      "Post",
      [field("id", { isId: true, type: "Int" }), field("title")],
      [
        relation("author", "User"),
        relation("comments", "Comment", { type: "many", isList: true }),
      ],
    ),
    model(
      "User",
      [field("id", { isId: true, type: "Int" }), field("name")],
      [relation("country", "Country"), relation("team", "Team")],
    ),
    model(
      "Country",
      [field("id", { isId: true, type: "Int" }), field("name"), field("isoCode")],
      [relation("region", "Region")],
    ),
    model("Region", [field("id", { isId: true, type: "Int" }), field("name")]),
    model("Team", [field("id", { isId: true, type: "Int" }), field("name")]),
    model("Comment", [field("id", { isId: true, type: "Int" }), field("body")]),
  ],
};

describe("resolvePath", () => {
  it("resolves a scalar on the root model", () => {
    const resolved = resolvePath(ir, "Post", "title");
    expect(resolved.field.name).toBe("title");
    expect(resolved.relations).toEqual([]);
    expect(resolved.model.name).toBe("Post");
  });

  it("resolves a path across three levels", () => {
    const resolved = resolvePath(ir, "Post", "author.country.name");
    expect(resolved.relations.map((r) => r.name)).toEqual(["author", "country"]);
    expect(resolved.field.name).toBe("name");
    expect(resolved.model.name).toBe("Country");
  });

  it("rejects a fourth level, naming the limit", () => {
    expect(() => resolvePath(ir, "Post", "author.country.region.name")).toThrow(
      /4 levels deep; the limit is 3/,
    );
  });

  it("rejects an unknown segment and lists what exists", () => {
    try {
      resolvePath(ir, "Post", "titel");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PathError);
      const e = error as PathError;
      expect(e.reason).toBe("unknown-segment");
      expect(e.segment).toBe("titel");
      expect(e.message).toContain("Available: id, title, author, comments");
    }
  });

  it("rejects traversing a scalar", () => {
    expect(() => resolvePath(ir, "Post", "title.length")).toThrow(
      /"title" is a scalar field on Post/,
    );
  });

  it("rejects a path that ends on a relation, and suggests the label field", () => {
    expect(() => resolvePath(ir, "Post", "author")).toThrow(
      /must end on a scalar field, for example "author.name"/,
    );
  });

  it("rejects traversing a to-many relation, explaining why", () => {
    try {
      resolvePath(ir, "Post", "comments.body");
      expect.unreachable("should have thrown");
    } catch (error) {
      const e = error as PathError;
      expect(e.reason).toBe("list-relation-in-path");
      expect(e.message).toContain("yields many rows, not one value");
    }
  });

  it("rejects an unknown model and lists the known ones", () => {
    expect(() => resolvePath(ir, "Nope", "title")).toThrow(/Known models: Post, User/);
  });

  it("rejects an empty segment", () => {
    expect(() => resolvePath(ir, "Post", "author..name")).toThrow(PathError);
    expect(() => resolvePath(ir, "Post", "")).toThrow(PathError);
  });
});

describe("buildIncludePlan — one query, never one per row", () => {
  it("returns undefined when nothing needs joining", () => {
    expect(buildIncludePlan(ir, "Post", ["title", "id"])).toBeUndefined();
  });

  it("builds one branch per relation level", () => {
    expect(buildIncludePlan(ir, "Post", ["author.country.name"])).toEqual({
      author: { country: true },
    });
  });

  it("merges several paths into a single plan, which is what keeps it to one query", () => {
    const plan = buildIncludePlan(ir, "Post", [
      "title",
      "author.name",
      "author.country.name",
      "author.country.isoCode",
      "author.team.name",
    ]);
    expect(plan).toEqual({ author: { country: true, team: true } });
  });

  it("does not let a shallow path erase a deeper one already planned", () => {
    // Order matters here: `author.name` alone would be `{author: true}`, and a
    // naive merge would drop the nested include added before it.
    const deepFirst = buildIncludePlan(ir, "Post", [
      "author.country.name",
      "author.name",
    ]);
    const shallowFirst = buildIncludePlan(ir, "Post", [
      "author.name",
      "author.country.name",
    ]);
    expect(deepFirst).toEqual({ author: { country: true } });
    expect(shallowFirst).toEqual({ author: { country: true } });
  });
});

describe("readPath", () => {
  it("reads a nested value", () => {
    expect(
      readPath({ author: { country: { name: "Senegal" } } }, "author.country.name"),
    ).toBe("Senegal");
  });

  it("yields undefined on a null relation instead of throwing", () => {
    // An optional relation is data, not an error.
    expect(readPath({ author: null }, "author.country.name")).toBeUndefined();
    expect(readPath({}, "author.name")).toBeUndefined();
    expect(readPath(null, "author")).toBeUndefined();
  });

  it("yields undefined when a segment is a primitive", () => {
    expect(readPath({ title: "x" }, "title.length")).toBeUndefined();
  });
});
