/**
 * The trust boundary of a read, on the way in.
 *
 * `/records` takes its paging, sorting, searching and filtering from the query
 * string, which is to say from an attacker. Stage 5 does this for writes; this
 * is the same job on the other side, and the rule is the same one: what was not
 * declared is dropped without a word, because naming the reason would say which
 * fields exist.
 *
 * What goes back out is `row-projection.ts`, which serves the writes too.
 */
import type { Ir, Query, Search, Sort, SortDirection, Table } from "@perchjs/core";
import { findModel, searchablePaths, sortablePaths } from "@perchjs/core";

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

/**
 * How long a search term may be.
 *
 * `perPage` and `page` are capped because an unbounded one is a denial of
 * service with a URL, and a term is the third parameter with that shape: an
 * `ILIKE '%…%'` is compared against every row, and the comparison costs what
 * the pattern is long. Nobody types two hundred characters into a search box.
 *
 * Truncated rather than refused. Dropping it returns every row, which is
 * further from what was asked than a prefix of it.
 */
export const MAX_SEARCH = 200;

/** The deepest page whose first row is still within `MAX_SKIP`. */
export function lastPage(perPage: number): number {
  return Math.floor(MAX_SKIP / perPage) + 1;
}

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
 * `include` is deliberately absent. The loading plan is derived from the
 * server's schema, and until columns declare what they reach the honest plan is
 * to load no relation at all. A client that asks for one is asking the wrong
 * side.
 */
export function readQuery(model: string, ir: Ir, raw: RawQuery, table?: Table): Query {
  const perPage = clamp(integer(raw.perPage) ?? DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);
  // The page is capped, not the offset it produces. Clamping the offset instead
  // left it off the page boundary — `perPage=30` stopped at 10000, which is no
  // page's first row — so the page the answer reported could not be asked for
  // again and got a different set of rows.
  const page = clamp(integer(raw.page) ?? 1, 1, lastPage(perPage));
  const skip = (page - 1) * perPage;
  const sort = sortOf(model, ir, raw.sort, table);
  const search = searchOf(model, ir, raw.search, table);

  return {
    model,
    skip,
    take: perPage,
    ...(sort === undefined ? {} : { sort: [sort] }),
    ...(search === undefined ? {} : { search }),
    // `filters` is read and dropped. A filter is a clause a resource declares
    // one that arrives from a URL and reaches `where` untouched is an injection
    // wearing the name of a feature. Nothing declares filters yet, so nothing
    // is accepted.
  };
}

/**
 * A search is an oracle too, and the same answer applies.
 *
 * Asking whether any row contains `@acme.com` answers a question about a
 * column nobody displayed, and repeating it letter by letter reads the value
 * out. So a term reaches exactly the paths a column declared with
 * `.searchable()`, and a resource with no table reaches the one field a human
 * reads it by — the label, which the caller already has.
 *
 * An empty allowlist means an empty search rather than a search of everything.
 */
function searchOf(
  model: string,
  ir: Ir,
  raw: unknown,
  table: Table | undefined,
): Search | undefined {
  const term = text(raw)?.slice(0, MAX_SEARCH);
  if (term === undefined || term === "") return undefined;

  const paths = [...searchable(model, ir, table)];
  return paths.length === 0 ? undefined : { term, paths };
}

function searchable(
  model: string,
  ir: Ir,
  table: Table | undefined,
): ReadonlySet<string> {
  if (table !== undefined) return searchablePaths(table);

  const meta = findModel(ir, model);
  return meta === undefined ? new Set() : new Set([meta.labelField]);
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
