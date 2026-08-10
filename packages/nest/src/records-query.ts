/**
 * The trust boundary of a read, in both directions.
 *
 * On the way in, `/records` takes its paging, sorting, searching and filtering
 * from the query string, which is to say from an attacker. Stage 5 does this
 * for writes; this is the same job on the other side, and the rule is the same
 * one: what was not declared is dropped without a word.
 *
 * On the way out, the rows are cut down to what the table declared. Every other
 * file in this repository already knows why — `serialise.ts` omits an invisible
 * node rather than flagging it, because "a node the client never receives
 * cannot leak its value". A row is no different, and a table that names three
 * columns while the model has thirty was sending all thirty.
 */
import type { Ir, Query, Row, Sort, SortDirection, Table } from "@perchjs/core";
import { findModel, sortablePaths } from "@perchjs/core";

export const DEFAULT_PER_PAGE = 25;

/**
 * A page nobody asked for costs the database the same as one somebody did. The
 * ceiling is what stops `perPage=1000000` from being a denial of service with a
 * URL.
 */
export const MAX_PER_PAGE = 100;

/**
 * How far into a table paging may reach.
 *
 * `perPage` was capped and `page` was not, which left the same denial of
 * service one parameter to the left: `page=999999999` asks PostgreSQL for
 * `OFFSET 99999999800`, and an offset is walked, not jumped to. Past this depth
 * nobody is reading a page — they want a search or a filter.
 */
export const MAX_SKIP = 10_000;

export interface RawQuery {
  readonly page?: unknown;
  readonly perPage?: unknown;
  readonly sort?: unknown;
  readonly search?: unknown;
  readonly filters?: unknown;
}

/**
 * Builds the `Query` the adapter will run, from parameters and from the schema
 * — never from the parameters alone.
 *
 * `include` is deliberately absent. PRD 03 §3.2 requires the loading plan to be
 * derived from the server's schema, and until columns declare what they reach
 * (PRD 07) the honest plan is to load no relation at all. A client that asks
 * for one is asking the wrong side.
 */
export function readQuery(model: string, ir: Ir, raw: RawQuery, table?: Table): Query {
  const perPage = clamp(integer(raw.perPage) ?? DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);
  const page = Math.max(integer(raw.page) ?? 1, 1);
  const skip = clamp((page - 1) * perPage, 0, MAX_SKIP);
  const sort = sortOf(model, ir, raw.sort, table);
  const search = text(raw.search);

  return {
    model,
    skip,
    take: perPage,
    ...(sort === undefined ? {} : { sort: [sort] }),
    ...(search === undefined ? {} : { search }),
    // `filters` is read and dropped. A filter is a clause a resource declares
    // (PRD 07 §5); one that arrives from a URL and reaches `where` untouched is
    // an injection wearing the name of a feature. Nothing declares filters yet,
    // so nothing is accepted.
  };
}

/**
 * Sorting is an oracle, so it is an allowlist.
 *
 * Ordering by a column reveals the order of its values, and pagination turns
 * that into a search: sort by a password hash, walk the pages, and the hash is
 * narrowed without ever being displayed.
 *
 * A table declares the answer with `.sortable()`, and then it is the only
 * answer — a column that did not ask is refused even if it is the key. Without
 * a table there is nothing to consult, and the fallback is the pair that cannot
 * say anything the caller does not already have: the key it addresses rows by
 * and the label it reads them by.
 */
function sortOf(
  model: string,
  ir: Ir,
  raw: unknown,
  table: Table | undefined,
): Sort | undefined {
  const [path, direction] = split(text(raw));
  if (path === undefined) return undefined;
  if (!allowed(model, ir, table).has(path)) return undefined;

  return { path, direction };
}

function allowed(model: string, ir: Ir, table: Table | undefined): ReadonlySet<string> {
  if (table !== undefined) return sortablePaths(table);

  const meta = findModel(ir, model);
  if (meta === undefined) return new Set();
  return new Set([meta.primaryKey.name, meta.labelField]);
}

/** `name` or `name:desc`; anything else is not a sort. */
function split(raw: string | undefined): [string | undefined, SortDirection] {
  if (raw === undefined) return [undefined, "asc"];
  const [path, order] = raw.split(":");
  if (path === undefined || path === "") return [undefined, "asc"];
  return [path, order === "desc" ? "desc" : "asc"];
}

function integer(raw: unknown): number | undefined {
  const value = Number(text(raw));
  return Number.isInteger(value) ? value : undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** Express hands a repeated parameter as an array; one value is one value. */
function text(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  return raw;
}

/**
 * The row keys a client may receive: the ones its columns name, and the key it
 * addresses rows by.
 *
 * Top-level segments, so `author.name` keeps `author`. Relations are not loaded
 * at all yet — `include` waits on the same declaration — so today that segment
 * is simply absent from the row; when it arrives, the whole related object goes
 * with it and cutting *that* down is its own piece of work.
 *
 * Without a table the default is the pair the sort allowlist already uses: the
 * key, and the label a human reads the row by. Declaring a table widens both,
 * and nothing else does.
 */
export function visibleKeys(
  model: string,
  ir: Ir,
  table: Table | undefined,
): ReadonlySet<string> {
  const meta = findModel(ir, model);
  const key = meta?.primaryKey.name;

  if (table === undefined) {
    return new Set([key, meta?.labelField].filter((n): n is string => n !== undefined));
  }
  const declared = table.state.columns.map((c) => head(c.state.path));
  return new Set([...declared, key].filter((n): n is string => n !== undefined));
}

/** Nothing else crosses. A row is rebuilt, never merely hidden. */
export function project(
  rows: readonly Row[],
  keys: ReadonlySet<string>,
): readonly Row[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of keys) if (key in row) out[key] = row[key];
    return out;
  });
}

function head(path: string): string {
  return path.split(".")[0] ?? path;
}
