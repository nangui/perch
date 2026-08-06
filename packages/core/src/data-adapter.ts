/**
 * The outbound port. `@perchjs/prisma` implements it; the domain only ever sees
 * this shape (ARCH 12 §1, PRD 01 §3.4).
 *
 * Nothing here mentions Prisma. That is the whole point: it is what makes a
 * Drizzle or a Mongoose adapter possible later without touching the engine, and
 * what lets the domain be tested without a database.
 */
import type { ModelMeta, Schema } from "./ir.js";

/** An opaque row. The engine addresses it through paths, never by shape. */
export type Row = Readonly<Record<string, unknown>>;

/** A primary key value. Strings and numbers cover v0.1; BigInt is serialised. */
export type Id = string | number;

export type SortDirection = "asc" | "desc";

export interface Sort {
  readonly path: string;
  readonly direction: SortDirection;
}

export type FilterOperator =
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

export interface Filter {
  readonly path: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

/**
 * A tree of relations to load eagerly. This is what makes the anti-N+1 rule
 * enforceable: a relation column contributes a branch here rather than a query
 * per row (PRD 01 §4, CLAUDE.md invariant 7).
 */
export interface IncludePlan {
  readonly [relation: string]: true | IncludePlan;
}

export interface Query {
  readonly model: string;
  readonly filters?: readonly Filter[];
  readonly sort?: readonly Sort[];
  readonly skip?: number;
  readonly take?: number;
  readonly include?: IncludePlan;
  /** Full-text-ish search across the model's searchable fields. */
  readonly search?: string;
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
  schema(): Schema;
  meta(model: string): ModelMeta;
  findMany(query: Query): Promise<Page>;
  findOne(model: string, id: Id, include?: IncludePlan): Promise<Row | null>;
  create(model: string, data: WriteTree): Promise<Row>;
  update(model: string, id: Id, data: WriteTree): Promise<Row>;
  delete(model: string, ids: readonly Id[]): Promise<number>;
  /** Must roll back entirely if any nested write fails (milestone A3). */
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
}
