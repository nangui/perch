import { describe, expect, it } from "vitest";
import { auditAggregations } from "./aggregate.js";
import type { Aggregation } from "./data-adapter.js";
import type { FieldMeta, ModelMeta, RelationMeta } from "./ir.js";

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

function relation(name: string, targetModel: string): RelationMeta {
  return {
    name,
    type: "many",
    targetModel,
    relationName: `${targetModel}To${name}`,
    foreignKeyFields: [],
    referencedFields: ["id"],
    isRequired: false,
    isList: true,
  };
}

const ORDER: ModelMeta = {
  name: "Order",
  dbName: "order",
  primaryKey: field("id", { isId: true, isUnique: true, type: "Int" }),
  fields: [
    field("id", { isId: true, isUnique: true, type: "Int" }),
    field("reference"),
    field("total", { type: "Decimal" }),
    field("quantity", { type: "Int" }),
    field("placedAt", { type: "DateTime" }),
    field("paid", { type: "Boolean" }),
    field("meta", { kind: "json", type: "Json" }),
    field("tags", { isList: true }),
    field("status", { kind: "enum", type: "String", enumValues: ["draft", "sent"] }),
  ],
  relations: [relation("items", "Item")],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "reference",
};

function problems(aggregations: Readonly<Record<string, Aggregation>>): string[] {
  return auditAggregations(ORDER, aggregations).map(
    (one) => `${one.field} ${one.problem}`,
  );
}

describe("what an aggregation may ask of a column", () => {
  it("admits the footer a table actually draws", () => {
    expect(
      problems({
        rows: { fn: "count" },
        priced: { fn: "count", path: "total" },
        revenue: { fn: "sum", path: "total" },
        typical: { fn: "avg", path: "quantity" },
        first: { fn: "min", path: "placedAt" },
        last: { fn: "max", path: "placedAt" },
      }),
    ).toEqual([]);
  });

  it("refuses a sum of a date, by the type the IR carries", () => {
    expect(problems({ when: { fn: "sum", path: "placedAt" } })).toEqual([
      "placedAt is a DateTime column, and a sum is worked out over Int, Float, " +
        "Decimal or BigInt",
    ]);
  });

  it("refuses an average of text, and of a boolean, and of json", () => {
    expect(
      problems({
        a: { fn: "avg", path: "reference" },
        b: { fn: "avg", path: "paid" },
        c: { fn: "avg", path: "meta" },
      }).length,
    ).toBe(3);
  });

  it("ranges an enum and refuses to sum it, the enum being a string downstream", () => {
    expect(problems({ furthest: { fn: "max", path: "status" } })).toEqual([]);
    expect(problems({ added: { fn: "sum", path: "status" } })).toHaveLength(1);
  });

  it("counts anything, including the column types nothing else admits", () => {
    expect(
      problems({
        a: { fn: "count", path: "paid" },
        b: { fn: "count", path: "meta" },
        c: { fn: "count", path: "tags" },
      }),
    ).toEqual([]);
  });

  it("refuses every function but count over a list of values", () => {
    expect(problems({ most: { fn: "max", path: "tags" } })).toEqual([
      "tags is a list of values, and a list has no single max",
    ]);
  });

  it("wants a column for everything but a count", () => {
    expect(problems({ rows: { fn: "count" } })).toEqual([]);
    expect(problems({ total: { fn: "sum" } })).toEqual([
      "total asks for a sum over no column at all. Only a count may leave the " +
        "column out, because counting rows needs none",
    ]);
  });

  it("names the key when there is no path to name instead", () => {
    // The complaint has to be findable in the declaration, and a declaration
    // that named no column left only the key it was filed under.
    expect(auditAggregations(ORDER, { revenue: { fn: "avg" } })[0]?.field).toBe(
      "revenue",
    );
  });

  it("sends a relation path back to the aggregate column it belongs to", () => {
    expect(problems({ sold: { fn: "sum", path: "items.quantity" } })[0]).toContain(
      "reaches through a relation",
    );
    expect(problems({ sold: { fn: "count", path: "items" } })[0]).toContain(
      "names a relation of Order rather than one of its columns",
    );
  });

  it("tells a misspelt column from a relation, because the fix differs", () => {
    expect(problems({ sold: { fn: "sum", path: "totl" } })).toEqual([
      "totl names no column of Order",
    ]);
  });

  it("complains once per aggregation, in the order they were declared", () => {
    expect(
      auditAggregations(ORDER, {
        first: { fn: "sum", path: "placedAt" },
        fine: { fn: "sum", path: "total" },
        third: { fn: "avg", path: "paid" },
      }).map((one) => one.field),
    ).toEqual(["placedAt", "paid"]);
  });
});
