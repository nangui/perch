/**
 * The outbound half of the boundary, on its own rather than through a route.
 *
 * It was only ever exercised over HTTP, where a fixture whose rows happened to
 * carry nothing undeclared let the whole thing pass while doing nothing.
 */
import { describe, expect, it } from "vitest";
import type { FieldMeta, Ir, ModelMeta, Row } from "@perchjs/core";
import { Table, TextColumn } from "@perchjs/core";
import { project, projectOne, visibleKeys } from "./row-projection.js";

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

const USER: ModelMeta = {
  name: "User",
  dbName: "users",
  primaryKey: field("id", { type: "Int", isId: true, isUnique: true }),
  fields: [],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "name",
};

const IR: Ir = { models: [USER] };

const ROW: Row = {
  id: 7,
  name: "Ada",
  passwordHash: "$2b$10$secret",
  author: { name: "Grace", email: "g@example.com" },
};

describe("which keys a client may receive", () => {
  it("is the key and the label when no table says otherwise", () => {
    expect([...visibleKeys("User", IR, undefined)].sort()).toEqual(["id", "name"]);
  });

  it("is what the columns name, plus the key rows are addressed by", () => {
    const table = Table.make().columns([
      TextColumn.make("name"),
      TextColumn.make("author.name"),
    ]);

    // The head of a path, so a relation column keeps its object rather than a
    // key that does not exist on the row.
    expect([...visibleKeys("User", IR, table)].sort()).toEqual([
      "author",
      "id",
      "name",
    ]);
  });

  it("keeps the key even when no column names it", () => {
    // The key is always there: the client addresses a row by it, and it is
    // already in the URL of the page that lists them.
    const table = Table.make().columns([TextColumn.make("name")]);

    expect(visibleKeys("User", IR, table).has("id")).toBe(true);
  });

  it("names nothing for a model the schema does not have", () => {
    expect(visibleKeys("Ghost", IR, undefined).size).toBe(0);
  });
});

describe("projecting a row", () => {
  it("rebuilds it from the keys, dropping everything else", () => {
    expect(projectOne(ROW, new Set(["id", "name"]))).toEqual({ id: 7, name: "Ada" });
  });

  it("leaves out a key the row does not carry rather than writing undefined", () => {
    // `{ deletedAt: undefined }` is a key on the wire, and a key is a statement
    // that the column exists.
    const projected = projectOne(ROW, new Set(["id", "absent"]));

    expect(projected).toEqual({ id: 7 });
    expect(Object.keys(projected)).not.toContain("absent");
  });

  it("does the same for every row of a page", () => {
    const rows = project(
      [ROW, { id: 8, passwordHash: "$2b$10$other" }],
      new Set(["id"]),
    );

    expect(rows).toEqual([{ id: 7 }, { id: 8 }]);
    expect(JSON.stringify(rows)).not.toContain("2b$10");
  });

  it("returns a new row rather than the one it was handed", () => {
    // Filtering in place would leave the caller's object mutated, and a caller
    // that reuses it — a cache, a transaction — would serve the pruned version.
    const projected = projectOne(ROW, new Set(["id"]));

    expect(projected).not.toBe(ROW);
    expect(ROW["passwordHash"]).toBe("$2b$10$secret");
  });
});
