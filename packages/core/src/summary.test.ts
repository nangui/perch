import { describe, expect, it } from "vitest";
import { TextColumn } from "./column.js";
import type { FieldMeta, ModelMeta } from "./ir.js";
import {
  auditSummaries,
  summariesFrom,
  summarised,
  summaryAggregations,
} from "./summary.js";
import { Table } from "./table.js";

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
    field("reference"),
    field("total", { type: "Decimal" }),
    field("quantity", { type: "Int" }),
    field("placedAt", { type: "DateTime" }),
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
  labelField: "reference",
};

describe("what a footer asks the database", () => {
  it("puts every column's footer into one call's worth of aggregations", () => {
    const table = Table.make().columns([
      TextColumn.make("total").summarise("sum", "avg"),
      TextColumn.make("quantity").summarise("sum"),
      TextColumn.make("reference"),
    ]);

    // One call, however many columns ask. Eight columns wanting a total are a
    // query, not eight.
    expect(summaryAggregations(table)).toEqual({
      "total:sum": { fn: "sum", path: "total" },
      "total:avg": { fn: "avg", path: "total" },
      "quantity:sum": { fn: "sum", path: "quantity" },
    });
  });

  it("asks a range as the two halves it is", () => {
    const table = Table.make().columns([TextColumn.make("placedAt").summarise("range")]);

    expect(summaryAggregations(table)).toEqual({
      "placedAt:min": { fn: "min", path: "placedAt" },
      "placedAt:max": { fn: "max", path: "placedAt" },
    });
  });

  it("keeps two columns asking the same function apart", () => {
    // One key between them would lose an answer, and lose it silently: the
    // footer would draw, with one column's total under both.
    const table = Table.make().columns([
      TextColumn.make("total").summarise("sum"),
      TextColumn.make("quantity").summarise("sum"),
    ]);

    expect(Object.keys(summaryAggregations(table))).toHaveLength(2);
  });

  it("asks nothing where no column said anything", () => {
    const table = Table.make().columns([TextColumn.make("reference")]);

    expect(summaryAggregations(table)).toEqual({});
    expect(summarised(table)).toBe(false);
  });

  it("knows when there is a footer to draw", () => {
    expect(summarised(Table.make().columns([TextColumn.make("total").summarise("sum")]))).toBe(
      true,
    );
  });
});

describe("what a footer makes of the answer", () => {
  it("reads it back per column, in the order the column declared", () => {
    const table = Table.make().columns([
      TextColumn.make("total").summarise("avg", "sum"),
      TextColumn.make("reference"),
    ]);

    expect(
      summariesFrom(table, { "total:avg": 12.5, "total:sum": 50 }),
    ).toEqual({
      total: [
        { of: "avg", value: 12.5 },
        { of: "sum", value: 50 },
      ],
    });
  });

  it("gives a range both of its ends", () => {
    const table = Table.make().columns([TextColumn.make("quantity").summarise("range")]);

    expect(
      summariesFrom(table, { "quantity:min": 1, "quantity:max": 9 }),
    ).toEqual({ quantity: [{ of: "range", value: 1, to: 9 }] });
  });

  it("carries a null through rather than turning it into a zero", () => {
    // What an empty set works out to, all the way to the reader. A zero here
    // is the one lie a footer cannot recover from, because somebody is looking
    // at it.
    const table = Table.make().columns([TextColumn.make("total").summarise("sum")]);

    expect(summariesFrom(table, { "total:sum": null })).toEqual({
      total: [{ of: "sum", value: null }],
    });
  });

  it("answers null for a key the adapter never sent back", () => {
    const table = Table.make().columns([TextColumn.make("total").summarise("sum")]);

    expect(summariesFrom(table, {})).toEqual({ total: [{ of: "sum", value: null }] });
  });

  it("leaves out a column that asked for nothing", () => {
    const table = Table.make().columns([
      TextColumn.make("total").summarise("sum"),
      TextColumn.make("reference"),
    ]);

    expect(Object.keys(summariesFrom(table, { "total:sum": 1 }))).toEqual(["total"]);
  });
});

describe("what the boot refuses", () => {
  it("refuses a total of a date, naming the column", () => {
    const table = Table.make().columns([TextColumn.make("placedAt").summarise("sum")]);

    expect(auditSummaries(ORDER, table)).toEqual([
      {
        field: "placedAt",
        problem:
          "is a DateTime column, and a sum is worked out over Int, Float, " +
          "Decimal or BigInt",
      },
    ]);
  });

  it("refuses a total reached through a relation", () => {
    const table = Table.make().columns([
      TextColumn.make("customer.name").summarise("sum"),
    ]);

    expect(auditSummaries(ORDER, table)[0]?.problem).toContain(
      "reaches through a relation",
    );
  });

  it("ranges a date, which is what a range is for", () => {
    const table = Table.make().columns([TextColumn.make("placedAt").summarise("range")]);

    expect(auditSummaries(ORDER, table)).toEqual([]);
  });

  it("counts anything, and totals what adds up", () => {
    const table = Table.make().columns([
      TextColumn.make("reference").summarise("count"),
      TextColumn.make("total").summarise("sum", "avg"),
      TextColumn.make("quantity").summarise("range"),
    ]);

    expect(auditSummaries(ORDER, table)).toEqual([]);
  });

  it("says nothing about a table with no footer", () => {
    expect(auditSummaries(ORDER, Table.make().columns([TextColumn.make("total")]))).toEqual(
      [],
    );
  });
});
