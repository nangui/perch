/**
 * `DataAdapter` over a Prisma client.
 *
 * The client is described structurally rather than imported: `@prisma/client` is
 * a peer dependency and its types only exist once somebody has generated them,
 * so a package that named them could not compile on its own. What is named here
 * is the delegate methods this adapter calls, and `$transaction`.
 */
import type {
  AggregateFunction,
  AggregateQuery,
  AggregateResult,
  AggregateValue,
  Aggregation,
  Complaint,
  DataAdapter,
  Clause,
  DeletedRows,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  GroupCount,
  GroupKey,
  GroupQuery,
  Narrowing,
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
import {
  auditAggregations,
  auditGroupKey,
  findModel,
  findRelation,
  SOFT_DELETE_FIELD,
} from "@perchjs/core";

export interface PrismaDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args: Record<string, unknown>) => Promise<number>;
  aggregate: (args: Record<string, unknown>) => Promise<unknown>;
  groupBy: (args: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
}

/**
 * What this adapter needs of a client: one method.
 *
 * No index signature for the delegates, though the delegates are what it spends
 * its time calling. TypeScript gives an object literal an implicit one and
 * never gives a class one, and a Prisma client is a class — so an interface
 * asking for it is an interface a Prisma client cannot satisfy, which is the
 * only thing it exists to describe. It was written that way, and the two
 * integration suites in this repository each got past it with a cast to
 * `never`. A contract nobody can meet without lying about the type is a
 * contract stated wrong.
 *
 * Looking a delegate up by name is this file's business and is done below.
 */
export interface PrismaClientLike {
  readonly $transaction: <T>(fn: (tx: PrismaClientLike) => Promise<T>) => Promise<T>;
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

  /**
   * Whether this model, or anything the include plan reaches, carries a column
   * the schema calls `BigInt`.
   *
   * Asked before any row is touched, so the common case costs a walk of the
   * schema and no allocation at all. Almost no model carries one.
   */
  #carriesBig(model: string, include: IncludePlan | undefined): boolean {
    const meta = findModel(this.#ir, model);
    if (meta === undefined) return false;
    if (meta.fields.some((one) => one.type === "BigInt")) return true;

    return Object.entries(include ?? {}).some(([name, nested]) => {
      const relation = findRelation(meta, name);
      return (
        relation !== undefined &&
        this.#carriesBig(relation.targetModel, nested === true ? undefined : nested)
      );
    });
  }

  /**
   * The rows again, with every `BigInt` column in them as a string.
   *
   * `JSON.stringify` refuses a `bigint` and the panel puts a row through it on
   * every route that shows one, so a column the schema admits would take the
   * page down. A string is what survives, and it is what the sum of the same
   * column already answers.
   *
   * Named from the schema rather than found by looking at values: a walk that
   * recursed into anything object-shaped would turn a `Date` into an empty
   * object and a Decimal into its internals, and fix a crash by breaking two
   * things that worked.
   */
  #widened(
    model: string,
    rows: readonly Row[],
    include: IncludePlan | undefined,
  ): readonly Row[] {
    if (!this.#carriesBig(model, include)) return rows;

    const meta = this.meta(model);
    const big = meta.fields.filter((one) => one.type === "BigInt").map((one) => one.name);
    const branches = Object.entries(include ?? {}).flatMap(([name, nested]) => {
      const relation = findRelation(meta, name);
      return relation === undefined
        ? []
        : [[name, relation.targetModel, nested === true ? undefined : nested] as const];
    });

    return rows.map((row) => {
      const out: Record<string, unknown> = { ...row };
      for (const name of big) out[name] = said(row[name]);
      for (const [name, target, nested] of branches) {
        const held = row[name];
        if (Array.isArray(held)) {
          out[name] = this.#widened(target, held as readonly Row[], nested);
        } else if (held !== null && typeof held === "object") {
          out[name] = this.#widened(target, [held as Row], nested)[0];
        }
      }
      return out;
    });
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

    return {
      rows: this.#widened(query.model, rows as Row[], query.include),
      total,
    };
  }

  /**
   * One call over one set of rows, and up to two statements.
   *
   * A count of rows goes to `count`, which this adapter was already calling
   * for a page's total and which a real database has therefore already
   * accepted. Everything else goes to `aggregate` in one object. A caller
   * wanting both a count of rows and a count of the rows some column is not
   * null on gets two statements rather than an argument shape invented here
   * to fold them into one.
   */
  async aggregate(query: AggregateQuery): Promise<AggregateResult> {
    refuse(
      `${query.model} cannot be aggregated as asked`,
      auditAggregations(this.meta(query.model), query.aggregations),
    );

    const delegate = this.#delegate(query.model);
    const where = both(whereOf(query), this.#liveness(query.model, query.deleted));
    const filter = Object.keys(where).length === 0 ? {} : { where };

    const asked = Object.entries(query.aggregations);
    const rows = asked.some(([, one]) => one.path === undefined);
    const selection = selectionOf(asked);

    const [counted, computed] = await Promise.all([
      rows ? delegate.count(filter) : undefined,
      selection === undefined
        ? undefined
        : delegate.aggregate({ ...filter, ...selection }),
    ]);

    const answer: Record<string, AggregateValue> = {};
    for (const [key, one] of asked) {
      answer[key] =
        one.path === undefined ? (counted ?? 0) : worked(computed, one, one.path);
    }
    return answer;
  }

  /**
   * How many rows sit under each value of one column, in one statement.
   *
   * What bounds it is the caller's: a page asks about the keys its own rows
   * hold, which it does with a clause like any other. Nothing is capped here,
   * because a cap here would be a number picked rather than derived.
   */
  async groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
    refuse(
      `${query.model} cannot be grouped as asked`,
      auditGroupKey(this.meta(query.model), query.by),
    );

    const where = both(whereOf(query), this.#liveness(query.model, query.deleted));
    const grouped = (await this.#delegate(query.model).groupBy({
      by: [query.by],
      ...(Object.keys(where).length === 0 ? {} : { where }),
      // The rows of each group, rather than the rows some column of it is not
      // null on: a group keyed null is a group, and counting a column would
      // answer zero for it.
      _count: true,
    })) as readonly Record<string, unknown>[];

    return grouped.map((one) => ({
      key: gathered(one[query.by]),
      total: Number(one["_count"] ?? 0),
    }));
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
    if (!this.#wanted(model, row, options?.deleted)) return null;
    return this.#widened(model, [row], options?.include)[0] ?? null;
  }

  async create(model: string, data: WriteTree): Promise<Row> {
    const row = (await this.#delegate(model).create({
      data: this.#dataOf(model, data),
    })) as Row;
    return this.#widened(model, [row], undefined)[0] ?? row;
  }

  async update(model: string, id: Id, data: WriteTree): Promise<Row> {
    const row = (await this.#delegate(model).update({
      where: { [this.meta(model).primaryKey.name]: id },
      data: this.#dataOf(model, data),
    })) as Row;
    return this.#widened(model, [row], undefined)[0] ?? row;
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
    const delegate = (this.#client as unknown as Record<string, unknown>)[name];
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

function whereOf(query: Narrowing): Record<string, unknown> {
  const clauses = (query.clauses ?? []).map(clauseOf);
  const search = searchOf(query.search);
  if (search !== undefined) clauses.push(search);
  // A narrowing that names a relation rather than a column, because a
  // many-to-many has a foreign key on neither side. `some` rather than `every`:
  // the question is whether this row is joined to that one, and `every` would
  // also answer true for a row joined to nothing at all.
  const joined = query.joinedTo;
  if (joined !== undefined) {
    // `some` and `none` rather than `every`: `every` is also true of a row
    // joined to nothing at all, which would put every unrelated row on the
    // page and read as a relation that holds the whole table.
    const how = joined.holding === "apart" ? "none" : "some";
    clauses.push({ [joined.relation]: { [how]: { [joined.key]: joined.value } } });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0] as Record<string, unknown>;
  return { AND: clauses };
}

/**
 * A refusal in the one shape both reads use.
 *
 * Not `describeComplaints`: it says the subject declares a form that cannot
 * work, which is true of every caller it has and of neither of these.
 */
function refuse(subject: string, complaints: readonly Complaint[]): void {
  if (complaints.length === 0) return;
  throw new Error(
    `${subject}:\n` +
      complaints.map(({ field, problem }) => `  - \`${field}\` ${problem}`).join("\n"),
  );
}

/**
 * One `BigInt` column's value, as something that crosses.
 *
 * Only a `bigint` is touched. A column the schema calls `BigInt` and a driver
 * hands back as something else is handed on as it came: this exists to stop a
 * crash, not to decide what a driver should have said.
 */
function said(raw: unknown): unknown {
  if (typeof raw === "bigint") return raw.toString();
  if (Array.isArray(raw)) return raw.map(said);
  return raw;
}

/**
 * A group's key, out of whatever the driver handed back.
 *
 * A bigint and a Decimal leave as strings for the reason an aggregate's do:
 * neither survives a double, and a key that lost its last digits would gather
 * two groups into one.
 */
function gathered(raw: unknown): GroupKey {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "bigint") return raw.toString();
  // No date: a timestamp is refused as a key, so one arriving here would mean
  // the audit above let through what it is there to stop.
  return typeof raw === "object" ? printed(raw) : null;
}

/** Prisma names each function by underscoring it. */
const UNDER: Readonly<Record<AggregateFunction, string>> = {
  count: "_count",
  sum: "_sum",
  avg: "_avg",
  min: "_min",
  max: "_max",
};

/**
 * The functions that name a column, folded into one argument per function.
 *
 * `undefined` where every aggregation counts rows, so that nothing asks the
 * database to work out an empty object.
 */
function selectionOf(
  asked: readonly [string, Aggregation][],
): Record<string, Record<string, true>> | undefined {
  const selection: Record<string, Record<string, true>> = {};
  for (const [, one] of asked) {
    if (one.path === undefined) continue;
    const under = UNDER[one.fn];
    selection[under] = { ...selection[under], [one.path]: true };
  }
  return Object.keys(selection).length === 0 ? undefined : selection;
}

/**
 * One answer, out of the shape Prisma nests it in and into the port's.
 *
 * A bigint and a Decimal both print themselves exactly and neither survives a
 * double, so both are widened to a string rather than quietly rounded. A sum
 * of an `Int` column stays a number, and a total past the safe integer is
 * Prisma's to raise on — the column said it fitted in an integer and the sum
 * of a column is not the column.
 */
function worked(
  computed: unknown,
  aggregation: Aggregation,
  path: string,
): AggregateValue {
  const under = (computed as Record<string, unknown> | undefined)?.[
    UNDER[aggregation.fn]
  ];
  const raw = (under as Record<string, unknown> | undefined)?.[path];

  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "string") return raw;
  if (raw instanceof Date) return raw;
  if (typeof raw === "bigint") return raw.toString();
  // A Decimal, which prints itself exactly and has no other way out of here
  // that keeps the fraction.
  return typeof raw === "object" ? printed(raw) : null;
}

/**
 * What a value says about itself, where it says anything.
 *
 * Asked by calling the method rather than by interpolating the value, because
 * an object that never replaced `toString` answers `[object Object]` — which
 * is a sentence, not a total, and the one thing this must not hand back as if
 * it were a number.
 */
function printed(raw: object): string | null {
  const own: unknown = (raw as { toString?: unknown }).toString;
  if (typeof own !== "function" || own === Object.prototype.toString) return null;
  const said: unknown = (own as () => unknown).call(raw);
  return typeof said === "string" ? said : null;
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
