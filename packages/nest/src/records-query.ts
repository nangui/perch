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
import type {
  Clause,
  DeletedRows,
  IncludePlan,
  Ir,
  Query,
  Search,
  Sort,
  SortDirection,
  Table,
} from "@perchjs/core";
import {
  buildIncludePlan,
  columnPaths,
  declaredFilters,
  findModel,
  searchablePaths,
  sortablePaths,
} from "@perchjs/core";

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
 * How long a term a caller writes may be — a search, or a filter value.
 *
 * `perPage` and `page` are capped because an unbounded one is a denial of
 * service with a URL, and a term is the third parameter with that shape: an
 * `ILIKE '%…%'` is compared against every row, and the comparison costs what
 * the pattern is long. Nobody types two hundred characters into a search box, or into a filter.
 *
 * Truncated rather than refused. Dropping it returns every row, which is
 * further from what was asked than a prefix of it.
 */
export const MAX_TERM = 200;

/** The deepest page whose first row is still within `MAX_SKIP`. */
export function lastPage(perPage: number): number {
  return Math.floor(MAX_SKIP / perPage) + 1;
}

/**
 * Whatever arrived in the query string. Every value is `unknown` because every
 * value is somebody else's.
 *
 * A filter arrives as `filter.<name>`, flat: measured, the query parser hands
 * `filter[x]=1` over as the literal key `filter[x]` rather than nesting it, so
 * neither form is an object and the dotted one reads better in an address.
 *
 * The index signature is the honest shape and it costs something: with it, a
 * misspelt `raw.serch` below is `unknown` rather than an error. Closing the
 * type was tried and does not work — what arrives really does carry keys nobody
 * declared, and a closed type refuses the object at every call site instead of
 * catching a typo. The four fields are read once, immediately below, which is
 * the whole surface that risk covers.
 */
export interface RawQuery {
  readonly page?: unknown;
  readonly perPage?: unknown;
  readonly sort?: unknown;
  readonly search?: unknown;
  readonly [parameter: string]: unknown;
}

/** The prefix a filter's value arrives under. */
export const FILTER_PREFIX = "filter.";

/** What a filter contributed: a clause, a reading mode, or one of each. */
export interface AcceptedFilter {
  readonly value: string;
  readonly clause?: Clause;
  readonly deleted?: DeletedRows;
}

/**
 * Builds the `Query` the adapter will run, from parameters and from the schema
 * — never from the parameters alone.
 *
 * `include` comes from the columns and never from the client. A column reading
 * `author.name` is what says the query must reach the author; a parameter
 * asking for a relation is asking the wrong side, and there is no parameter
 * that could.
 *
 * One plan, merged across every column, for one query. A page of fifty rows
 * costs the same as a page of one.
 */
/**
 * The query, and the filters that got through, from one reading.
 *
 * Two readings would be two answers to "what was applied": the route builds the
 * clauses and the response names them, and nothing but this would keep those
 * from drifting apart.
 */
export function readList(
  model: string,
  ir: Ir,
  raw: RawQuery,
  table?: Table,
  mayReadDeleted = true,
): { readonly query: Query; readonly filters: Readonly<Record<string, string>> } {
  const accepted = acceptedFilters(raw, table, mayReadDeleted);

  return {
    query: readQuery(model, ir, raw, table, accepted),
    filters: Object.fromEntries([...accepted].map(([name, one]) => [name, one.value])),
  };
}

/**
 * The loading plan, or none.
 *
 * A path the IR does not have stops the boot, so a running panel never gets
 * here with one. This still refuses to throw: a plan is how the page is loaded
 * efficiently, not whether it can be loaded at all, and taking the list down
 * over a typo would be out of proportion to what the plan is for.
 */
function planFor(model: string, ir: Ir, table: Table): IncludePlan | undefined {
  try {
    return buildIncludePlan(ir, model, columnPaths(table));
  } catch {
    return undefined;
  }
}

export function readQuery(
  model: string,
  ir: Ir,
  raw: RawQuery,
  table?: Table,
  accepted = acceptedFilters(raw, table),
): Query {
  const perPage = clamp(integer(raw.perPage) ?? DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);
  // The page is capped, not the offset it produces. Clamping the offset instead
  // left it off the page boundary — `perPage=30` stopped at 10000, which is no
  // page's first row — so the page the answer reported could not be asked for
  // again and got a different set of rows.
  const page = clamp(integer(raw.page) ?? 1, 1, lastPage(perPage));
  const skip = (page - 1) * perPage;
  const sort = sortOf(model, ir, raw.sort, table);
  const search = searchOf(model, ir, raw.search, table);
  const clauses = [...accepted.values()].flatMap((one) =>
    one.clause === undefined ? [] : [one.clause],
  );
  // The one filter that lifts the read's own exclusion rather than narrowing
  // what it returned. One per table, which the boot enforces — so the reduce
  // below has at most one thing to find.
  const deleted = [...accepted.values()].reduce<DeletedRows | undefined>(
    (found, one) => one.deleted ?? found,
    undefined,
  );
  // Built from the columns, once, for the whole page.
  const include = table === undefined ? undefined : planFor(model, ir, table);

  return {
    model,
    skip,
    take: perPage,
    ...(sort === undefined ? {} : { sort: [sort] }),
    ...(search === undefined ? {} : { search }),
    ...(include === undefined ? {} : { include }),
    ...(clauses.length === 0 ? {} : { clauses }),
    ...(deleted === undefined ? {} : { deleted }),
  };
}

/**
 * Which filters were accepted, by name: the value that got through and the
 * clause it produced.
 *
 * A value from the query string becomes a clause only by passing through the
 * declaration that named it.
 *
 * This is the whole reason a filter is not a clause. What arrives is a name and
 * a value; the path and the comparison come from the table, in code nobody
 * outside can reach. A name nothing declared is dropped in silence, like a sort
 * on an undeclared column and for the same reason — an error would say which
 * filters exist.
 *
 * Values are capped like a search term. A filter is compared against every row
 * too, and the comparison costs what the value is long.
 *
 * The names come back out because the controls are drawn from them: what the
 * server accepted, not what was asked, in the way the sort and the page already
 * answer.
 */
export function acceptedFilters(
  raw: Record<string, unknown>,
  table: Table | undefined,
  /**
   * Whether this reader may lift the read's own exclusion.
   *
   * A filter they may not use is treated as one nobody declared: no clause, no
   * lifting, and no echo saying it was applied. Silently, like every other
   * refusal at this boundary — a message here would say which resources keep
   * something worth hiding.
   */
  mayReadDeleted = true,
): ReadonlyMap<string, AcceptedFilter> {
  const accepted = new Map<string, AcceptedFilter>();
  if (table === undefined) return accepted;

  const declared = declaredFilters(table);

  for (const [parameter, raw_] of Object.entries(raw)) {
    if (!parameter.startsWith(FILTER_PREFIX)) continue;

    const name = parameter.slice(FILTER_PREFIX.length);
    const filter = declared.get(name);
    const term = text(raw_)?.slice(0, MAX_TERM);
    if (filter === undefined || term === undefined) continue;

    // Either contribution counts. A filter that narrows produces a clause; the
    // one that decides which rows are read at all produces neither a clause nor
    // nothing — treating "no clause" as "not accepted" dropped it silently.
    const clause = filter.clause(term);
    const deleted = mayReadDeleted ? filter.deleted(term) : undefined;
    if (clause !== undefined || deleted !== undefined) {
      accepted.set(name, {
        value: term,
        ...(clause === undefined ? {} : { clause }),
        ...(deleted === undefined ? {} : { deleted }),
      });
    }
  }
  return accepted;
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
  const term = text(raw)?.slice(0, MAX_TERM);
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
