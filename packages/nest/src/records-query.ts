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
  FormState,
  IncludePlan,
  Ir,
  Option,
  Query,
  SchemaNode,
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
  Schema,
  SchemaFilter,
  searchablePaths,
  serialise,
  sortablePaths,
} from "@perchjs/core";
import type { OptionLoader } from "./relationship-options.js";
import { admit } from "./admission.js";

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
  /** Usually one. A range contributes both of its ends. */
  readonly clauses?: readonly Clause[];
  readonly deleted?: DeletedRows;
  /** A filter with a form of its own: what its fields settled on. */
  readonly state?: FormState;
  /** And the tree its controls are drawn from, options and all. */
  readonly tree?: SchemaNode;
}

/**
 * A value as the column holds it, not as a link wrote it.
 *
 * A closed set is declared with the values the column keeps — the number `1`,
 * not `"1"` — and a link can only carry the written form. The field takes that
 * form back, because it compares its choices by how they are written, so
 * nothing refuses it and nothing looks wrong. Then the query compares a string
 * against an `Int` column, finds no rows, and reads as an empty table rather
 * than as a mistake.
 *
 * The same trap `SelectFilter` names and answers, in the one filter that had no
 * answer for it.
 */
function chosen(options: readonly Option[] | undefined, value: unknown): unknown {
  if (options === undefined || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((one) => chosen(options, one));

  // Compared the way a link writes them, which is the same rule that decides
  // what may be put in one at all — so a value no link could carry matches
  // nothing rather than matching everything as `[object Object]`.
  const written = inALink(value);
  const found =
    written === undefined
      ? undefined
      : options.find((one) => inALink(one.value) === written);
  return found === undefined ? value : found.value;
}

/** Every path in a filter's form that offers a closed set, and what it offers. */
function closedSets(node: SchemaNode): ReadonlyMap<string, readonly Option[]> {
  const sets = new Map<string, readonly Option[]>();
  const walk = (one: SchemaNode): void => {
    if (one.path !== undefined && one.options !== undefined) {
      sets.set(one.path, one.options);
    }
    for (const child of one.children ?? []) walk(child);
  };
  walk(node);
  return sets;
}

/**
 * A value as a link can carry it, or nothing where it cannot.
 *
 * The boot refuses a field holding anything else, so this is the second half of
 * a rule rather than a guess — and the half that runs where a forged request
 * can reach it.
 */
function inALink(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
}

/** What running a filter's own form needs, which a plain filter does not. */
export interface FilterAdmission {
  readonly user: unknown;
  readonly loadOptions?: OptionLoader;
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
export async function readList(
  model: string,
  ir: Ir,
  raw: RawQuery,
  table?: Table,
  mayReadDeleted = true,
  /** What a filter carrying its own form needs to resolve it. */
  admission?: FilterAdmission,
): Promise<{
  readonly query: Query;
  readonly filters: Readonly<Record<string, string>>;
  /** The trees and values of the filters that carry a form of their own. */
  readonly forms: ReadonlyMap<string, AcceptedFilter>;
}> {
  const accepted = await acceptedFilters(raw, table, mayReadDeleted, admission);

  return {
    query: readQuery(model, ir, raw, table, accepted),
    filters: Object.fromEntries(
      [...accepted].flatMap(([name, one]) =>
        // A filter with a form of its own is named once per field, under the
        // parameter each of them arrived as. Left out, the address bar carries
        // no sign of it and a narrowed page stops being a link somebody can
        // send — which is most of what putting filters in a URL is for.
        one.tree === undefined
          ? [[name, one.value] as const]
          : Object.entries(one.state ?? {}).flatMap(([path, value]) => {
              const written = inALink(value);
              return written === undefined
                ? []
                : [[`${name}.${path}`, written] as const];
            }),
      ),
    ),
    forms: new Map([...accepted].filter(([, one]) => one.tree !== undefined)),
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
  table: Table | undefined,
  /**
   * Required, and not defaulted to reading them here: a filter carrying its own
   * form has to be resolved before it can say anything, and resolving is not
   * something this can do while staying synchronous. A default would have made
   * every caller that forgot get a query with no filters in it and no sign.
   */
  accepted: ReadonlyMap<string, AcceptedFilter>,
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
  const clauses = [...accepted.values()].flatMap((one) => one.clauses ?? []);
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
export async function acceptedFilters(
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
  /** What a filter carrying its own form needs to resolve it. */
  admission?: FilterAdmission,
): Promise<ReadonlyMap<string, AcceptedFilter>> {
  const accepted = new Map<string, AcceptedFilter>();
  if (table === undefined) return accepted;

  const declared = declaredFilters(table);
  const { terms, forms } = gathered(raw);

  for (const [name, filter] of declared) {
    if (filter instanceof SchemaFilter) {
      const applied = await narrowed(filter, forms.get(name) ?? {}, admission);
      if (applied !== undefined) accepted.set(name, applied);
      continue;
    }

    const term = terms.get(name);
    if (term === undefined) continue;

    // Either contribution counts. A filter that narrows produces clauses; the
    // one that decides which rows are read at all produces neither a clause nor
    // nothing — treating "no clause" as "not accepted" dropped it silently.
    const clauses = filter.clauses(term);
    const deleted = mayReadDeleted ? filter.deleted(term) : undefined;
    if (clauses.length > 0 || deleted !== undefined) {
      accepted.set(name, {
        // What was used, not what arrived. A filter that read half a value and
        // dropped the rest would otherwise send the whole of it back, and the
        // control would draw itself from a half nothing applied.
        value: filter.applied(term),
        ...(clauses.length === 0 ? {} : { clauses }),
        ...(deleted === undefined ? {} : { deleted }),
      });
    }
  }
  return accepted;
}

/**
 * The filter parameters, sorted into the two shapes they come in.
 *
 * `filter.status=draft` is one value for one filter. `filter.where.country=fr`
 * is one field of a filter that carries a form, and the part after the second
 * dot is the path inside it — which is why the split is on the first dot and
 * not the last: a path may have dots of its own, and they belong to the form.
 */
function gathered(raw: Record<string, unknown>): {
  readonly terms: ReadonlyMap<string, string>;
  readonly forms: ReadonlyMap<string, FormState>;
} {
  const terms = new Map<string, string>();
  const forms = new Map<string, Record<string, unknown>>();

  for (const [parameter, value] of Object.entries(raw)) {
    if (!parameter.startsWith(FILTER_PREFIX)) continue;

    const rest = parameter.slice(FILTER_PREFIX.length);
    const dot = rest.indexOf(".");
    const term = text(value)?.slice(0, MAX_TERM);
    if (term === undefined) continue;

    if (dot === -1) {
      terms.set(rest, term);
      continue;
    }
    const name = rest.slice(0, dot);
    const path = rest.slice(dot + 1);
    if (name === "" || path === "") continue;

    const held = forms.get(name) ?? {};
    held[path] = term;
    forms.set(name, held);
  }

  return { terms, forms };
}

/**
 * A filter's own form, run the way a form is run.
 *
 * The same admission the save and the state pass use, so what a query is handed
 * has been through the tree: an unknown path, an invisible field, a disabled
 * one, a value the field would not take — none of them reaches it, and none of
 * them says so. A filter is not a save; there is nobody to report to.
 *
 * The resolved tree comes back with the clauses because the controls are drawn
 * from it. A `Select` inside a filter gets its options the same way a form's
 * does, which is the whole reason the fields go through the cycle at all.
 */
async function narrowed(
  filter: SchemaFilter,
  values: FormState,
  admission: FilterAdmission | undefined,
): Promise<AcceptedFilter | undefined> {
  if (admission === undefined) return undefined;

  const schema = Schema.make([...filter.state.schema]);
  const { tree } = await admit({
    schema,
    state: values,
    operation: "create",
    user: admission.user,
    record: null,
    ...(admission.loadOptions === undefined
      ? {}
      : { loadOptions: admission.loadOptions }),
  });

  // The resolved tree's state and not the sanitized values, because they are
  // not the same thing: what a client sent is in both, and what the field
  // declared as its `default()` is only in the first. Reading the second left
  // a default declared and applied nowhere — the control showed nothing
  // chosen, and the query read `undefined` for a choice the form had made.
  //
  // Safe for the query to read: everything here is either a value that got
  // through the boundary or a value the server itself declared.
  const settled = serialise(tree);
  const sets = closedSets(settled.schema);
  const clauses = filter.narrow({
    get: (path) => chosen(sets.get(path), settled.state[path]),
  });
  return {
    // Named per field rather than as one string; this is the shape the others
    // use and there is nothing to put in it.
    value: "",
    state: settled.state,
    tree: settled.schema,
    ...(clauses.length === 0 ? {} : { clauses }),
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
