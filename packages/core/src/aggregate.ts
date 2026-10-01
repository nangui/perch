/**
 * What an aggregation may ask of a column.
 *
 * Read from the IR, so the answer exists before any request does. A sum of a
 * date is a resource written wrong rather than an error to handle the moment a
 * reader opens the page, and this is what lets the boot say so — the same shape
 * as every other audit here, a list of complaints and no opinion about what the
 * caller does with them.
 */
import type { Complaint } from "./audit.js";
import type { AggregateFunction, Aggregation } from "./data-adapter.js";
import type { ModelMeta, ScalarType } from "./ir.js";
import { findField, findRelation } from "./ir.js";

/** What a database adds up. */
const NUMERIC: readonly ScalarType[] = ["Int", "Float", "Decimal", "BigInt"];

/**
 * What a panel puts in order.
 *
 * Narrower than what the database would allow: `min` and `max` reach further
 * than anything in this project ranges, and what is absent is absent because
 * nothing asks for it rather than because it could not be done.
 *
 * An enum needs no entry. The generator resolves one to `String`, on the
 * grounds that it behaves as a constrained string everywhere downstream, so an
 * enum column is counted and ranged and refused a sum — which is what the
 * database would have answered anyway.
 */
const ORDERED: readonly ScalarType[] = [...NUMERIC, "String", "DateTime"];

const ADMITS: Readonly<Record<AggregateFunction, readonly ScalarType[] | "any">> = {
  count: "any",
  sum: NUMERIC,
  avg: NUMERIC,
  min: ORDERED,
  max: ORDERED,
};

/**
 * Every complaint the aggregations of one model earn, in the order they were
 * declared. Empty means every one of them can be asked of the database.
 */
export function auditAggregations(
  model: ModelMeta,
  aggregations: Readonly<Record<string, Aggregation>>,
): readonly Complaint[] {
  const complaints: Complaint[] = [];
  for (const [key, aggregation] of Object.entries(aggregations)) {
    const problem = fault(model, aggregation);
    if (problem !== undefined) {
      complaints.push({ field: aggregation.path ?? key, problem });
    }
  }
  return complaints;
}

function fault(model: ModelMeta, aggregation: Aggregation): string | undefined {
  const { fn, path } = aggregation;

  if (path === undefined) {
    if (fn === "count") return undefined;
    return (
      `asks for a ${fn} over no column at all. Only a count may leave the ` +
      `column out, because counting rows needs none`
    );
  }

  // A relation path is the other kind of aggregate: one value per row, over
  // that row's related rows, which belongs in the read that fetched the row
  // rather than in a call of its own. And a to-many has no single value to
  // work over even in principle.
  if (path.includes(".")) {
    return (
      `reaches through a relation. An aggregate over a set of rows works on ` +
      `that model's own columns; a value per row over its related rows is an ` +
      `aggregate column, and belongs to the read`
    );
  }

  const field = findField(model, path);
  if (field === undefined) {
    return findRelation(model, path) === undefined
      ? `names no column of ${model.name}`
      : `names a relation of ${model.name} rather than one of its columns`;
  }

  // A scalar list, such as a `String[]`. Counting the rows it is not null on
  // still means something; asking for the greatest of a column of lists does
  // not.
  if (field.isList && fn !== "count") {
    return `is a list of values, and a list has no single ${fn}`;
  }

  const admits = ADMITS[fn];
  if (admits !== "any" && !admits.includes(field.type)) {
    return `is a ${field.type} column, and a ${fn} is worked out over ${listed(admits)}`;
  }

  return undefined;
}

function listed(types: readonly ScalarType[]): string {
  if (types.length < 2) return types.join("");
  return `${types.slice(0, -1).join(", ")} or ${String(types[types.length - 1])}`;
}
