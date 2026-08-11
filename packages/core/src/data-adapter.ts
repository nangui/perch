/**
 * The outbound port. `@perchjs/prisma` implements it; the domain only ever sees
 * this shape.
 *
 * Nothing here mentions Prisma. That is the whole point: it is what makes a
 * Drizzle or a Mongoose adapter possible later without touching the engine, and
 * what lets the domain be tested without a database.
 */
import type { ModelMeta, Ir } from "./ir.js";

/** An opaque row. The engine addresses it through paths, never by shape. */
export type Row = Readonly<Record<string, unknown>>;

/** A primary key value. Strings and numbers cover v0.1; BigInt is serialised. */
export type Id = string | number;

export type SortDirection = "asc" | "desc";

export interface Sort {
  readonly path: string;
  readonly direction: SortDirection;
}

/** How a clause compares. */
export type ClauseOperator =
  | "equals"
  | "not"
  | "in"
  | "notIn"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "startsWith"
  | "endsWith";

/**
 * One condition a query applies: a path, how to compare it, and to what.
 *
 * Not what a resource declares. A declaration carries a label and a control,
 * and produces one of these once a value arrives — which is the whole security
 * story: the path and the operator are settled by the declaration, and only the
 * value ever comes from outside.
 */
export interface Clause {
  readonly path: string;
  readonly operator: ClauseOperator;
  readonly value: unknown;
}

/**
 * A tree of relations to load eagerly. This is what makes the anti-N+1 rule
 * enforceable: a relation column contributes a branch here rather than a query
 * per row (CLAUDE.md invariant 7).
 */
export interface IncludePlan {
  readonly [relation: string]: true | IncludePlan;
}

export interface Search {
  readonly term: string;
  /** Dotted, like a sort's: `title`, or `author.name`. */
  readonly paths: readonly string[];
}

export interface Query {
  readonly model: string;
  readonly clauses?: readonly Clause[];
  readonly sort?: readonly Sort[];
  readonly skip?: number;
  readonly take?: number;
  readonly include?: IncludePlan;
  /**
   * A term, and the paths it may reach.
   *
   * The paths are named rather than left to the adapter. Which columns a search
   * touches is an authorization decision — a match on a column nobody displays
   * answers a question about it, one letter at a time — so it is settled where
   * the declaration is read, not where the query is built.
   */
  readonly search?: Search;
}

export interface Page {
  readonly rows: readonly Row[];
  readonly total: number;
}

/**
 * A write, including nested ones. Modelled as data rather than as Prisma's
 * argument shape so the domain can build it without knowing the adapter — and so
 * a Repeater in a single transaction (milestone A3) is expressible.
 */
export interface WriteTree {
  readonly set?: Readonly<Record<string, unknown>>;
  readonly relations?: Readonly<Record<string, RelationWrite>>;
}

export interface RelationWrite {
  readonly create?: readonly WriteTree[];
  readonly connect?: readonly Id[];
  readonly disconnect?: readonly Id[];
  readonly update?: readonly { readonly id: Id; readonly data: WriteTree }[];
  readonly delete?: readonly Id[];
}

export interface DataAdapter {
  /** Resolved once at bootstrap and cached; never called on a hot path. */
  ir(): Ir;
  meta(model: string): ModelMeta;
  /**
   * A page, in a total order.
   *
   * The order has to end on something unique — the primary key will do — even
   * when `sort` is empty or names a column with repeated values. Two pages are
   * two queries, so without that a row comes back on both and another on
   * neither, and the reader never learns which. It is the adapter's to add,
   * because it is the adapter that knows what the database guarantees.
   */
  findMany(query: Query): Promise<Page>;
  findOne(model: string, id: Id, include?: IncludePlan): Promise<Row | null>;
  create(model: string, data: WriteTree): Promise<Row>;
  update(model: string, id: Id, data: WriteTree): Promise<Row>;
  /**
   * Destroys the rows. Unconditional in v0.1, on every model — a model whose
   * `hasSoftDelete` is true is deleted exactly like any other (ADR 0014). Soft
   * delete arrives in v0.2 with the restore and force-delete it needs to be
   * usable, and it changes what this method means.
   */
  delete(model: string, ids: readonly Id[]): Promise<number>;
  /** Must roll back entirely if any nested write fails (milestone A3). */
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
}
