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
  Filter,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  Page,
  Query,
  RelationMeta,
  RelationWrite,
  Row,
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
    const where = whereOf(query, this.meta(query.model));

    // One query for the page and one for the count, never one per row.
    const [rows, total] = await Promise.all([
      delegate.findMany({
        ...(Object.keys(where).length === 0 ? {} : { where }),
        ...(query.sort === undefined ? {} : { orderBy: orderOf(query.sort) }),
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

function whereOf(query: Query, meta: ModelMeta): Record<string, unknown> {
  const clauses = (query.filters ?? []).map(filterOf);
  const search = searchOf(query.search, meta);
  if (search !== undefined) clauses.push(search);

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0] as Record<string, unknown>;
  return { AND: clauses };
}

/** `author.name` becomes a nested clause, which is what keeps it one query. */
function filterOf(filter: Filter): Record<string, unknown> {
  const [head, ...rest] = filter.path.split(".");
  const leaf = { [filter.operator]: filter.value };
  return rest.length === 0
    ? { [head as string]: leaf }
    : { [head as string]: filterOf({ ...filter, path: rest.join(".") }) };
}

/**
 * The one field a human reads to recognise a row, and no other.
 *
 * Every string column would reach a password hash or a token: rows would come
 * back on a match nobody can see, and `search=a`, `search=ab` narrows a secret
 * down from which rows return. Widening this belongs to whoever declares which
 * fields are searchable, not to a default.
 *
 * Not split into words either: splitting is what collapses on large datasets, so
 * it stays opt-in rather than being the default.
 */
function searchOf(
  search: string | undefined,
  meta: ModelMeta,
): Record<string, unknown> | undefined {
  if (search === undefined || search === "") return undefined;

  const field = meta.fields.find(
    (candidate) =>
      candidate.name === meta.labelField &&
      candidate.type === "String" &&
      candidate.kind === "scalar",
  );
  if (field === undefined) return undefined;

  return { [field.name]: { contains: search, mode: "insensitive" } };
}

function orderOf(sort: readonly Sort[]): Record<string, unknown>[] {
  return sort.map(({ path, direction }) => nestedOrder(path, direction));
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
