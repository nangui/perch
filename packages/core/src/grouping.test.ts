import { describe, expect, it } from "vitest";
import { TextColumn } from "./column.js";
import { auditGrouping } from "./grouping.js";
import type { FieldMeta, ModelMeta } from "./ir.js";
import { serialiseTable, Table } from "./table.js";

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

const ORDER: ModelMeta = {
  name: "Order",
  dbName: "order",
  primaryKey: field("id", { isId: true, type: "Int" }),
  fields: [
    field("id", { isId: true, type: "Int" }),
    field("status", { kind: "enum", type: "String", enumValues: ["draft", "sent"] }),
    field("paid", { type: "Boolean" }),
    field("quantity", { type: "Int" }),
    field("placedAt", { type: "DateTime" }),
    field("meta", { kind: "json", type: "Json" }),
    field("tags", { isList: true }),
  ],
  relations: [
    {
      name: "customer",
      type: "one",
      targetModel: "Customer",
      relationName: "CustomerToOrder",
      foreignKeyFields: ["customerId"],
      referencedFields: ["id"],
      isRequired: false,
      isList: false,
    },
  ],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "status",
};

const grouped = (path: string): Table =>
  Table.make().columns([TextColumn.make("status")]).groupBy(path);

const said = (path: string): string =>
  auditGrouping(ORDER, grouped(path))
    .map((one) => `${one.field} ${one.problem}`)
    .join(" ");

describe("what a table may gather its rows by", () => {
  it("admits the groupings a reader would ask for", () => {
    for (const path of ["status", "paid", "quantity"]) {
      expect(auditGrouping(ORDER, grouped(path))).toEqual([]);
    }
  });

  it("says nothing about a table that gathers nothing", () => {
    expect(
      auditGrouping(ORDER, Table.make().columns([TextColumn.make("status")])),
    ).toEqual([]);
  });

  it("refuses a timestamp, and says what it would have needed", () => {
    // Not an error a database reports. Grouped as it stands it is a header per
    // row, which reads like a table nobody meant to group.
    expect(said("placedAt")).toContain("is a timestamp");
    expect(said("placedAt")).toContain("without a bucket");
  });

  it("refuses what a database will not group at all", () => {
    expect(said("meta")).toBe("meta is a Json column, which a database will not group rows by");
  });

  it("refuses a list, a row holding several belonging to several groups", () => {
    expect(said("tags")).toContain("is a list of values");
  });

  it("refuses a path through a relation, and says it is not in this release", () => {
    expect(said("customer.name")).toContain("reaches through a relation");
  });

  it("tells a relation from a misspelt column, the fix being different", () => {
    expect(said("customer")).toBe(
      "customer names a relation of Order rather than one of its columns",
    );
    expect(said("statuss")).toBe("statuss names no column of Order");
  });

  it("names the path, which is where the declaration is", () => {
    expect(auditGrouping(ORDER, grouped("meta"))[0]?.field).toBe("meta");
  });
});

describe("what the client is told about a grouping", () => {
  it("carries the path, so the renderer knows where a group stops", () => {
    expect(serialiseTable(grouped("status")).groupBy).toBe("status");
  });

  it("says nothing where the table gathers nothing", () => {
    expect(
      serialiseTable(Table.make().columns([TextColumn.make("status")])).groupBy,
    ).toBeUndefined();
  });

  it("does not need the grouped column to be on the table", () => {
    // A table grouped by a status it does not show is a reasonable table, so
    // the path travels whether or not a column draws it.
    const table = Table.make().columns([TextColumn.make("quantity")]).groupBy("status");

    expect(serialiseTable(table).groupBy).toBe("status");
    expect(auditGrouping(ORDER, table)).toEqual([]);
  });
});
