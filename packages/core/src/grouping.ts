/**
 * What a column can gather rows by.
 *
 * Read from the IR, so it is answerable before any request. Two kinds of
 * refusal, and they are refusals for different reasons, which is why they do
 * not share a sentence: a timestamp a database would group perfectly well and
 * uselessly, giving a header per row, and the two types it will not group at
 * all.
 */
import type { Complaint } from "./audit.js";
import { findField, findRelation } from "./ir.js";
import type { ModelMeta, ScalarType } from "./ir.js";
import type { Table } from "./table.js";

/**
 * What gathers rows into groups somebody would want.
 *
 * An enum needs no entry: the generator resolves one to `String`, on the
 * grounds that it behaves as a constrained string everywhere downstream, and a
 * status is the grouping a table wants most.
 *
 * A `Float` and a `Decimal` are admitted and will usually be a mistake, every
 * distinct amount being its own group. They are left in because which of them
 * is continuous is the schema's business and not this file's to guess.
 */
const GATHERS: readonly ScalarType[] = [
  "String",
  "Int",
  "Float",
  "Decimal",
  "BigInt",
  "Boolean",
];

/** Every complaint a table's grouping earns. Empty means it can be served. */
export function auditGrouping(model: ModelMeta, table: Table): readonly Complaint[] {
  const path = table.state.groupBy;
  return path === undefined ? [] : auditGroupKey(model, path);
}

/**
 * The same question asked of a path rather than of a table.
 *
 * What an adapter has in hand: it is given a path and never a declaration, so
 * the check it can run is this one. The boot runs it through the table above,
 * which is where the complaint can still name a line somebody wrote.
 */
export function auditGroupKey(model: ModelMeta, path: string): readonly Complaint[] {
  const problem = fault(model, path);
  return problem === undefined ? [] : [{ field: path, problem }];
}

function fault(model: ModelMeta, path: string): string | undefined {
  // A relation path would group by a value on another row, which needs a join
  // the grouped read has no way to express and a header that reads as a key
  // rather than as a name even once it does.
  if (path.includes(".")) {
    return (
      "reaches through a relation. A table gathers rows by one of its own " +
      "columns; grouping by a value on another row is not in this release"
    );
  }

  const field = findField(model, path);
  if (field === undefined) {
    return findRelation(model, path) === undefined
      ? `names no column of ${model.name}`
      : `names a relation of ${model.name} rather than one of its columns`;
  }

  if (field.isList) {
    return "is a list of values, and a row holding several belongs to several groups";
  }

  // Grouped as it stands, every distinct instant is its own group: twenty-five
  // headers of one above twenty-five rows, which no database reports as a
  // failure and no reader can tell from a table with nothing worth grouping.
  if (field.type === "DateTime") {
    return (
      "is a timestamp, and grouping one without a bucket puts every row in a " +
      "group of its own. Grouping by the day or the month is not in this release"
    );
  }

  if (!GATHERS.includes(field.type)) {
    return `is a ${field.type} column, which a database will not group rows by`;
  }

  return undefined;
}
