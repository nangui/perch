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
 * per row.
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
  /** Which rows to read. `without` where nothing says otherwise. */
  readonly deleted?: DeletedRows;
  /**
   * A term, and the paths it may reach.
   *
   * The paths are named rather than left to the adapter. Which columns a search
   * touches is an authorization decision — a match on a column nobody displays
   * answers a question about it, one letter at a time — so it is settled where
   * the declaration is read, not where the query is built.
   */
  readonly search?: Search;
  /**
   * Narrowed to the rows joined to one other row, where no column says which.
   *
   * A many-to-many is a to-many on both sides and a foreign key on neither —
   * the join table is the database's, and there is nothing on either model to
   * compare. So the narrowing names the relation instead of a column.
   *
   * Never built from a request. It is what scopes a relation manager to its
   * parent, which makes it the one narrowing a client must not be able to
   * write: a body naming another parent is a body reading somebody else's
   * rows, and no validation of the child could tell.
   */
  readonly joinedTo?: JoinNarrowing;
}

export interface JoinNarrowing {
  /** The relation on the model being read that points back at the other row. */
  readonly relation: string;
  /** The column on that other row being compared — not always its key. */
  readonly key: string;
  readonly value: string | number;
  /**
   * Which side of the join to keep: the rows joined to it, or the rows not.
   *
   * `joined` lists what a manager holds. `apart` lists what could be added to
   * it — the same question asked the other way round, and asked here rather
   * than by reading everything and subtracting in memory, which is a page of
   * rows fetched to throw most of them away.
   */
  readonly holding?: "joined" | "apart";
}

/**
 * Which rows a read is asking for.
 *
 * `without` is the default everywhere, and it is named rather than assumed:
 * "show me the deleted ones" is a question a reader asks, and a default that
 * changed with the caller would be one nobody could predict.
 *
 * It reaches the relations too. A page that filters its own rows and loads a
 * relation that does not has filtered nothing that matters — the deleted
 * children arrive inside the parents.
 */
export type DeletedRows = "without" | "with" | "only";

export interface ReadOptions {
  readonly include?: IncludePlan;
  readonly deleted?: DeletedRows;
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
  findOne(model: string, id: Id, options?: ReadOptions): Promise<Row | null>;
  create(model: string, data: WriteTree): Promise<Row>;
  update(model: string, id: Id, data: WriteTree): Promise<Row>;
  /**
   * Marks the rows deleted on a soft-deleting model, and destroys them on every
   * other one.
   *
   * The verb a panel offers means what a reader means by it, and destroying is
   * a second decision with a name of its own. A model with no `deletedAt` has
   * nothing to mark, so this is what it always was.
   */
  delete(model: string, ids: readonly Id[]): Promise<number>;
  /**
   * Destroys the rows, on every model, marked or not.
   *
   * Where a cascade happens: the database follows its own, because this one is
   * a real delete. Nothing follows a mark.
   */
  forceDelete(model: string, ids: readonly Id[]): Promise<number>;
  /**
   * Clears the mark. Answers how many rows it lifted, which is not how many
   * were asked for — one already live was never marked.
   *
   * May fail on a unique column: an address a hidden row still holds can have
   * been taken while it was hidden. That is a constraint error to report, not
   * one to work around.
   */
  restore(model: string, ids: readonly Id[]): Promise<number>;

  /**
   * Joins rows to one other row, and unjoins them.
   *
   * For a relation whose join table belongs to neither model: there is no
   * column to write, so this is not an update with a value in it. The row is
   * untouched either way — what changes is whether it is joined.
   *
   * Both are asked to be idempotent. Attaching what is already attached and
   * detaching what is not are the two things a reader does by pressing twice,
   * and neither is an error.
   */
  attach(
    model: string,
    id: Id,
    relation: string,
    targets: readonly Id[],
  ): Promise<void>;
  detach(
    model: string,
    id: Id,
    relation: string,
    targets: readonly Id[],
  ): Promise<void>;
  /** Must roll back entirely if any nested write fails (milestone A3). */
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
}
