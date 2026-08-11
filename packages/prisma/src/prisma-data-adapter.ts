/**
 * `DataAdapter` over a Prisma client.
 *
 * The client is described structurally rather than imported: `@prisma/client` is
 * a peer dependency and its types only exist once somebody has generated them,
 * so a package that named them could not compile on its own. What is named here
 * is the six delegate methods this adapter calls, and `$transaction`.
 */
import type {
  DataAdapter,
  Clause,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  Page,
  Query,
  RelationMeta,
  RelationWrite,
  Row,
  Search,
  Sort,
  WriteTree,
} from "@perchjs/core";
import { findModel } from "@perchjs/core";

export interface PrismaDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
}

export interface PrismaClientLike {
  readonly $transaction: <T>(fn: (tx: PrismaClientLike) => Promise<T>) => Promise<T>;
  readonly [delegate: string]: unknown;
}

export interface PrismaDataAdapterOptions {
  readonly client: PrismaClientLike;
  /** Written by `@perchjs/prisma-generator` at `prisma generate` (ADR 0012). */
  readonly ir: Ir;
}

export class PrismaDataAdapter implements DataAdapter {
  readonly #client: PrismaClientLike;
  readonly #ir: Ir;

  /** Set only by `transaction`, on the adapter it hands to the callback. */
  #nested = false;

  constructor(options: PrismaDataAdapterOptions) {
    this.#client = options.client;
    this.#ir = options.ir;
  }

  ir(): Ir {
    return this.#ir;
  }

  meta(model: string): ModelMeta {
    const found = findModel(this.#ir, model);
    if (found === undefined) throw new Error(`no model named ${model} in the schema.`);
    return found;
  }

  async findMany(query: Query): Promise<Page> {
    const delegate = this.#delegate(query.model);
    const where = whereOf(query);

    // One query for the page and one for the count, never one per row.
    const [rows, total] = await Promise.all([
      delegate.findMany({
        ...(Object.keys(where).length === 0 ? {} : { where }),
        orderBy: orderOf(query.sort, this.meta(query.model).primaryKey.name),
        ...(query.skip === undefined ? {} : { skip: query.skip }),
        ...(query.take === undefined ? {} : { take: query.take }),
        ...includeOf(query.include),
      }),
      delegate.count(Object.keys(where).length === 0 ? {} : { where }),
    ]);

    return { rows: rows as Row[], total };
  }

  async findOne(model: string, id: Id, include?: IncludePlan): Promise<Row | null> {
    const row = await this.#delegate(model).findUnique({
      where: { [this.meta(model).primaryKey.name]: id },
      ...includeOf(include),
    });
    return (row as Row | null) ?? null;
  }

  async create(model: string, data: WriteTree): Promise<Row> {
    return (await this.#delegate(model).create({
      data: this.#dataOf(model, data),
    })) as Row;
  }

  async update(model: string, id: Id, data: WriteTree): Promise<Row> {
    return (await this.#delegate(model).update({
      where: { [this.meta(model).primaryKey.name]: id },
      data: this.#dataOf(model, data),
    })) as Row;
  }

  async delete(model: string, ids: readonly Id[]): Promise<number> {
    const key = this.meta(model).primaryKey.name;
    const { count } = await this.#delegate(model).deleteMany({
      where: { [key]: { in: [...ids] } },
    });
    return count;
  }

  /** Nested writes run inside it, so a half-written tree never survives. */
  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    // Prisma's transaction client refuses `$transaction`, and the callback is
    // already inside one — so this says so rather than letting the client raise
    // something about a method that is missing on purpose.
    if (this.#nested) {
      throw new Error("already inside a transaction; Prisma does not nest them.");
    }
    return await this.#client.$transaction(async (tx) => {
      const inside = new PrismaDataAdapter({ client: tx, ir: this.#ir });
      inside.#nested = true;
      return await fn(inside);
    });
  }

  /**
   * A nested write names its rows by the target model's own key. Assuming `id`
   * works until somebody has a `uuid`, and then it fails at the database.
   */
  #dataOf(model: string, tree: WriteTree): Record<string, unknown> {
    const data: Record<string, unknown> = { ...tree.set };
    const relations = this.meta(model).relations;

    for (const [name, write] of Object.entries(tree.relations ?? {})) {
      const relation = relations.find((candidate) => candidate.name === name);
      if (relation === undefined)
        throw new Error(`${model} has no relation named ${name}.`);
      data[name] = this.#relationOf(relation, write);
    }
    return data;
  }

  /**
   * Cardinality decides the shape. Prisma takes a list on a to-many and a
   * single value on a to-one, and refuses a list where it wants one row —
   * `Expected AuthorWhereUniqueInput, provided (Object)`, which is what a
   * mock-based test will never say.
   */
  #relationOf(relation: RelationMeta, write: RelationWrite): Record<string, unknown> {
    const model = relation.targetModel;
    const key = this.meta(model).primaryKey.name;
    const byKey = (id: Id): Record<string, unknown> => ({ [key]: id });

    const shape = (rows: readonly unknown[], operation: string): unknown => {
      if (relation.isList) return rows;
      if (rows.length !== 1) {
        throw new Error(
          `${relation.name} is a to-one relation: ${operation} takes exactly ` +
            `one row, got ${String(rows.length)}.`,
        );
      }
      return rows[0];
    };

    const out: Record<string, unknown> = {};
    if (write.create !== undefined) {
      out["create"] = shape(
        write.create.map((nested) => this.#dataOf(model, nested)),
        "create",
      );
    }
    if (write.connect !== undefined) {
      out["connect"] = shape(write.connect.map(byKey), "connect");
    }
    if (write.disconnect !== undefined) {
      out["disconnect"] = shape(write.disconnect.map(byKey), "disconnect");
    }
    if (write.update !== undefined) {
      out["update"] = shape(
        write.update.map(({ id, data }) => ({
          where: byKey(id),
          data: this.#dataOf(model, data),
        })),
        "update",
      );
    }
    if (write.delete !== undefined) {
      out["delete"] = shape(write.delete.map(byKey), "delete");
    }
    return out;
  }

  #delegate(model: string): PrismaDelegate {
    const name = delegateName(model);
    const delegate = this.#client[name];
    if (delegate === undefined) {
      throw new Error(`the Prisma client has no \`${name}\` delegate for ${model}.`);
    }
    return delegate as PrismaDelegate;
  }
}

/** Prisma names its delegates after the model, first letter lowered. */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function whereOf(query: Query): Record<string, unknown> {
  const clauses = (query.clauses ?? []).map(clauseOf);
  const search = searchOf(query.search);
  if (search !== undefined) clauses.push(search);

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0] as Record<string, unknown>;
  return { AND: clauses };
}

function clauseOf(clause: Clause): Record<string, unknown> {
  return nested(clause.path, { [clause.operator]: clause.value });
}

/**
 * The term against every path the caller allowed, and no other.
 *
 * Which paths those are is not decided here: every string column would reach a
 * password hash or a token, and `search=a`, `search=ab` narrows a secret down
 * from which rows come back. The allowlist is built where the declaration is
 * read, and this applies it.
 *
 * Not split into words either: splitting is what collapses on large datasets,
 * so it stays opt-in rather than being the default.
 */
function searchOf(search: Search | undefined): Record<string, unknown> | undefined {
  if (search === undefined || search.term === "" || search.paths.length === 0) {
    return undefined;
  }

  const clauses = search.paths.map((path) =>
    nested(path, { contains: search.term, mode: "insensitive" }),
  );
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

/** `author.name` becomes a nested clause, which is what keeps it one query. */
function nested(path: string, leaf: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  return {
    [head ?? path]: rest.length === 0 ? leaf : nested(rest.join("."), leaf),
  };
}

/**
 * The order, always ending on the primary key.
 *
 * A page is one query and the next page is another. Ordering by a column that
 * is not unique leaves rows with equal values in whatever order the database
 * chose that time, so a row can come back on both pages and another on neither.
 * The key is unique and indexed, which makes the order total and the cost nil.
 * It takes the direction of the sort it follows, so "newest first" stays that
 * way among rows sharing a timestamp.
 *
 * Sent even when nothing was asked, where Prisma would have added the same
 * thing itself — measured: a limited query with no `orderBy` comes out as
 * `ORDER BY "id" ASC`. That is a courtesy this does not rely on. The port asks
 * every adapter for a total order, and an adapter that gets it by accident
 * loses it on the release that changes its mind.
 */
function orderOf(
  sort: readonly Sort[] | undefined,
  primaryKey: string,
): Record<string, unknown>[] {
  const asked = (sort ?? []).map(({ path, direction }) => nestedOrder(path, direction));
  const last = sort?.at(-1);
  if (last?.path === primaryKey) return asked;

  return [...asked, { [primaryKey]: last?.direction ?? "asc" }];
}

function nestedOrder(path: string, direction: string): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  return {
    [head ?? path]:
      rest.length === 0 ? direction : nestedOrder(rest.join("."), direction),
  };
}

function includeOf(plan: IncludePlan | undefined): Record<string, unknown> {
  const map = includeMap(plan);
  return map === undefined ? {} : { include: map };
}

/** The map itself, so nesting wraps it once rather than once per level. */
function includeMap(
  plan: IncludePlan | undefined,
): Record<string, unknown> | undefined {
  if (plan === undefined || Object.keys(plan).length === 0) return undefined;

  const map: Record<string, unknown> = {};
  for (const [relation, nested] of Object.entries(plan)) {
    const inner = nested === true ? undefined : includeMap(nested);
    map[relation] = inner === undefined ? true : { include: inner };
  }
  return map;
}
