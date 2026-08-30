/**
 * `DataAdapter` over a Prisma client.
 *
 * The client is described structurally rather than imported: `@prisma/client` is
 * a peer dependency and its types only exist once somebody has generated them,
 * so a package that named them could not compile on its own. What is named here
 * is the delegate methods this adapter calls, and `$transaction`.
 */
import type {
  DataAdapter,
  Clause,
  DeletedRows,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  Page,
  Query,
  ReadOptions,
  RelationMeta,
  RelationWrite,
  Row,
  Search,
  Sort,
  WriteTree,
} from "@perchjs/core";
import { findModel, findRelation, SOFT_DELETE_FIELD } from "@perchjs/core";

export interface PrismaDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
}

export interface PrismaClientLike {
  readonly $transaction: <T>(fn: (tx: PrismaClientLike) => Promise<T>) => Promise<T>;
  readonly [delegate: string]: unknown;
}

export interface PrismaDataAdapterOptions {
  readonly client: PrismaClientLike;
  /** Written by `@perchjs/prisma-generator` at `prisma generate`. */
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
    const where = both(whereOf(query), this.#liveness(query.model, query.deleted));

    // One query for the page and one for the count, never one per row.
    const [rows, total] = await Promise.all([
      delegate.findMany({
        ...(Object.keys(where).length === 0 ? {} : { where }),
        orderBy: orderOf(query.sort, this.meta(query.model).primaryKey.name),
        ...(query.skip === undefined ? {} : { skip: query.skip }),
        ...(query.take === undefined ? {} : { take: query.take }),
        ...this.#includeOf(query.model, query.include, query.deleted),
      }),
      delegate.count(Object.keys(where).length === 0 ? {} : { where }),
    ]);

    return { rows: rows as Row[], total };
  }

  async findOne(model: string, id: Id, options?: ReadOptions): Promise<Row | null> {
    const row = (await this.#delegate(model).findUnique({
      where: { [this.meta(model).primaryKey.name]: id },
      ...this.#includeOf(model, options?.include, options?.deleted),
    })) as Row | null;

    // Filtered after the read, not in the `where`: `findUnique` takes only a
    // unique field, so the liveness clause cannot go in it. One row is already
    // in hand, so this costs nothing.
    if (row === null) return null;
    return this.#wanted(model, row, options?.deleted) ? row : null;
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

  /**
   * Joining rows to one other row, and unjoining them.
   *
   * `connect` and `disconnect` rather than a write of any column: the join
   * table is Prisma's, and neither model has one to set. Both are idempotent
   * there — connecting what is connected and disconnecting what is not are
   * no-ops — which is exactly what a reader pressing a button twice needs.
   */
  async attach(
    model: string,
    id: Id,
    relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    await this.#join(model, id, relation, targets, "connect");
  }

  async detach(
    model: string,
    id: Id,
    relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    await this.#join(model, id, relation, targets, "disconnect");
  }

  async #join(
    model: string,
    id: Id,
    relation: string,
    targets: readonly Id[],
    how: "connect" | "disconnect",
  ): Promise<void> {
    // Nothing named is nothing to do, and an empty list would otherwise reach
    // the database as an update with an empty operation in it.
    if (targets.length === 0) return;

    const owner = findModel(this.ir(), model);
    if (owner === undefined) throw new Error(`Model \`${model}\` is not in the IR`);
    const target = findRelation(owner, relation);
    if (target === undefined) {
      throw new Error(`\`${model}\` declares no relation \`${relation}\``);
    }
    const key = this.meta(target.targetModel).primaryKey.name;

    await this.#delegate(model).update({
      where: { [this.meta(model).primaryKey.name]: id },
      data: { [relation]: { [how]: targets.map((one) => ({ [key]: one })) } },
    });
  }

  async delete(model: string, ids: readonly Id[]): Promise<number> {
    if (!this.meta(model).hasSoftDelete) return await this.forceDelete(model, ids);
    return await this.#mark(model, ids, new Date());
  }

  async forceDelete(model: string, ids: readonly Id[]): Promise<number> {
    const key = this.meta(model).primaryKey.name;
    const { count } = await this.#delegate(model).deleteMany({
      where: { [key]: { in: [...ids] } },
    });
    return count;
  }

  async restore(model: string, ids: readonly Id[]): Promise<number> {
    // Nothing to lift on a model with no mark, and answering zero says so
    // without pretending a row changed.
    if (!this.meta(model).hasSoftDelete) return 0;
    return await this.#mark(model, ids, null);
  }

  /** Sets or clears the tombstone, and answers how many rows moved. */
  async #mark(model: string, ids: readonly Id[], at: Date | null): Promise<number> {
    const key = this.meta(model).primaryKey.name;
    const { count } = await this.#delegate(model).updateMany({
      where: {
        [key]: { in: [...ids] },
        // Only the ones that are not already where they are being put, so the
        // count is rows that moved rather than rows that were named.
        [SOFT_DELETE_FIELD]: at === null ? { not: null } : null,
      },
      data: { [SOFT_DELETE_FIELD]: at },
    });
    return count;
  }

  /**
   * The clause that leaves marked rows out, or nothing.
   *
   * Nothing on a model with no tombstone: a `where` on a column the table has
   * not got is an error, not a filter that matches everything.
   */
  #liveness(model: string, deleted: DeletedRows | undefined): Record<string, unknown> {
    if (!this.meta(model).hasSoftDelete) return {};
    if (deleted === "with") return {};
    return { [SOFT_DELETE_FIELD]: deleted === "only" ? { not: null } : null };
  }

  /** Whether a row already in hand is one this read asked for. */
  #wanted(model: string, row: Row, deleted: DeletedRows | undefined): boolean {
    if (!this.meta(model).hasSoftDelete || deleted === "with") return true;
    const marked =
      row[SOFT_DELETE_FIELD] !== null && row[SOFT_DELETE_FIELD] !== undefined;
    return deleted === "only" ? marked : !marked;
  }

  /**
   * The include map, with the same liveness clause at every depth.
   *
   * A page that filters its own rows and loads a relation that does not has
   * filtered nothing that matters — the deleted children arrive inside the
   * parents. Which model each branch leads to comes from the IR, because the
   * plan carries relation names and nothing else.
   */
  #includeOf(
    model: string,
    plan: IncludePlan | undefined,
    deleted: DeletedRows | undefined,
  ): Record<string, unknown> {
    const map = this.#includeMap(model, plan, deleted);
    return map === undefined ? {} : { include: map };
  }

  #includeMap(
    model: string,
    plan: IncludePlan | undefined,
    deleted: DeletedRows | undefined,
  ): Record<string, unknown> | undefined {
    if (plan === undefined || Object.keys(plan).length === 0) return undefined;

    const relations = this.meta(model).relations;
    const map: Record<string, unknown> = {};
    for (const [name, nested] of Object.entries(plan)) {
      const target = relations.find((one) => one.name === name)?.targetModel;
      // A relation the IR does not carry is the boot's to complain about; here
      // it is loaded plainly rather than filtered against a model nobody found.
      const where = target === undefined ? {} : this.#liveness(target, deleted);
      const inner =
        target === undefined
          ? undefined
          : this.#includeMap(target, nested === true ? undefined : nested, deleted);

      const branch = {
        ...(Object.keys(where).length === 0 ? {} : { where }),
        ...(inner === undefined ? {} : { include: inner }),
      };
      map[name] = Object.keys(branch).length === 0 ? true : branch;
    }
    return map;
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
      // A row taken out of a repeater is a row somebody deleted, and `delete`
      // marks a soft-deleting model. Emitting Prisma's nested `delete` here
      // would destroy through the route a reader uses most while the action
      // route only hid — the same word meaning two things one click apart.
      if (this.meta(model).hasSoftDelete) {
        out["updateMany"] = [
          {
            where: { [key]: { in: write.delete.map((id) => id) } },
            data: { [SOFT_DELETE_FIELD]: new Date() },
          },
        ];
      } else {
        out["delete"] = shape(write.delete.map(byKey), "delete");
      }
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

/**
 * Two `where`s, without one losing to the other.
 *
 * Spreading them looks equivalent and is not: a declared filter on the
 * tombstone column would be overwritten by the liveness clause under the same
 * key, and silently — a filter somebody wrote that stops doing anything.
 */
function both(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(right).length === 0) return left;
  if (Object.keys(left).length === 0) return right;
  return { AND: [left, right] };
}

function whereOf(query: Query): Record<string, unknown> {
  const clauses = (query.clauses ?? []).map(clauseOf);
  const search = searchOf(query.search);
  if (search !== undefined) clauses.push(search);
  // A narrowing that names a relation rather than a column, because a
  // many-to-many has a foreign key on neither side. `some` rather than `every`:
  // the question is whether this row is joined to that one, and `every` would
  // also answer true for a row joined to nothing at all.
  const joined = query.joinedTo;
  if (joined !== undefined) {
    clauses.push({ [joined.relation]: { some: { [joined.key]: joined.value } } });
  }

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
