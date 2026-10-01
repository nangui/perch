/**
 * What a table says about a column once, under all of it.
 *
 * A footer answers a different question from a cell: not what this row holds
 * but what the rows hold together, over the set a filter and a search left.
 * That makes it the same question the page above it asked, which is why the
 * narrowing is shared rather than rebuilt — a total over rows nobody listed is
 * worse than no total, because it reads like one.
 *
 * Four words, and no fifth. A `count` names its column rather than
 * counting rows: the row count is already on the response as `total`, and
 * sending it again under a column would be one number arriving twice with
 * nothing to say which was which.
 */
import type { Complaint } from "./audit.js";
import type {
  AggregateResult,
  AggregateValue,
  Aggregation,
} from "./data-adapter.js";
import { auditAggregations } from "./aggregate.js";
import type { SummaryOf } from "./column.js";
import type { ModelMeta } from "./ir.js";
import type { Table } from "./table.js";

/** One line of a footer, worked out by the database and not by the browser. */
export interface Summary {
  readonly of: SummaryOf;
  /**
   * What it came to, or null where there was no row to work it out over.
   *
   * Null rather than zero, all the way out to the reader: a footer showing 0
   * under a filter nothing matched states a total nobody computed, and the one
   * place that lie is unrecoverable is the one a reader is looking at.
   */
  readonly value: AggregateValue;
  /** The far end, for a range. Absent for the other three. */
  readonly to?: AggregateValue;
}

/** How a range's two halves are keyed apart, and how a summary's key is built. */
const RANGE: readonly ["min", "max"] = ["min", "max"];

function keyed(path: string, fn: string): string {
  return `${path}:${fn}`;
}

/**
 * Every aggregation a table's footers need, as one call's worth.
 *
 * One call for the whole footer rather than one per column: the port takes
 * several named aggregations precisely so that eight columns asking for a total
 * are one query. Keyed by column and function, because two columns asking for
 * the same function are two answers and a shared key would lose one.
 */
export function summaryAggregations(
  table: Table,
): Readonly<Record<string, Aggregation>> {
  const asked: Record<string, Aggregation> = {};
  for (const column of table.state.columns) {
    const path = column.state.path;
    for (const of of column.state.summarise ?? []) {
      if (of === "range") {
        for (const fn of RANGE) asked[keyed(path, fn)] = { fn, path };
        continue;
      }
      asked[keyed(path, of)] = { fn: of, path };
    }
  }
  return asked;
}

/**
 * The answer, read back into what each column asked for.
 *
 * Keyed by column path and in the order the column declared them, so a footer
 * drawn from this reads the way the table was written rather than the way an
 * object happened to iterate.
 */
export function summariesFrom(
  table: Table,
  answer: AggregateResult,
): Readonly<Record<string, readonly Summary[]>> {
  const found: Record<string, Summary[]> = {};
  for (const column of table.state.columns) {
    const path = column.state.path;
    const declared = column.state.summarise ?? [];
    if (declared.length === 0) continue;

    found[path] = declared.map((of) =>
      of === "range"
        ? {
            of,
            value: answer[keyed(path, "min")] ?? null,
            to: answer[keyed(path, "max")] ?? null,
          }
        : { of, value: answer[keyed(path, of)] ?? null },
    );
  }
  return found;
}

/**
 * What a column cannot be asked, read from the schema at boot.
 *
 * A sum of a date, or of a column on another model reached through a relation,
 * is a table written wrong. Asked here, where the schema is in hand and
 * nobody is waiting, rather than when a reader opens the list and meets a
 * footer that will not draw: that reader is the one person who cannot fix
 * it.
 */
export function auditSummaries(
  model: ModelMeta,
  table: Table,
): readonly Complaint[] {
  return auditAggregations(model, summaryAggregations(table));
}
