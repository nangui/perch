/**
 * The adapter's job is translation: a `Query` in, Prisma arguments out. These
 * assert the arguments, against a client that records them.
 *
 * What they cannot say is whether Prisma accepts those arguments — a recorder
 * accepts anything. `tooling/database.test.ts` runs them against a real
 * PostgreSQL and is what caught the to-one relation shape below.
 */
import { describe, expect, it, vi } from "vitest";
import type { Ir, Row } from "@perchjs/core";
import type { PrismaClientLike, PrismaDelegate } from "./prisma-data-adapter.js";
import { delegateName, PrismaDataAdapter } from "./prisma-data-adapter.js";
import { FIXTURE_IR } from "./__fixtures__/ir.js";

interface Recorder {
  readonly adapter: PrismaDataAdapter;
  readonly calls: Record<keyof PrismaDelegate, ReturnType<typeof vi.fn>>;
  readonly client: PrismaClientLike;
}

function recorder(
  rows: unknown[] = [],
  total = 0,
  worked: unknown = {},
  grouped: unknown[] = [],
): Recorder {
  const calls = {
    findMany: vi.fn(() => Promise.resolve(rows)),
    findUnique: vi.fn(() => Promise.resolve(rows[0] ?? null)),
    count: vi.fn(() => Promise.resolve(total)),
    aggregate: vi.fn(() => Promise.resolve(worked)),
    groupBy: vi.fn(() => Promise.resolve(grouped)),
    create: vi.fn((args: { data: unknown }) => Promise.resolve(args.data)),
    update: vi.fn((args: { data: unknown }) => Promise.resolve(args.data)),
    updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: 2 })),
  };
  const client = {
    user: calls,
    post: calls,
    note: calls,
    $transaction: <T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T> =>
      fn(client),
  } as unknown as PrismaClientLike;

  return {
    adapter: new PrismaDataAdapter({ client, ir: FIXTURE_IR }),
    calls,
    client,
  };
}

const argsOf = (fn: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  fn.mock.calls[0]?.[0] as Record<string, unknown>;

describe("which delegate a model reaches", () => {
  it.each([
    ["User", "user"],
    ["Post", "post"],
    ["OrderItem", "orderItem"],
  ])("sends %s to %s", (model, delegate) => {
    expect(delegateName(model)).toBe(delegate);
  });

  it("says so plainly when the client has no such delegate", async () => {
    const { adapter } = recorder();

    await expect(adapter.findMany({ model: "Comment" })).rejects.toThrow(
      /no `comment` delegate/,
    );
  });
});

describe("reading a page", () => {
  it("asks for the rows and the count, and nothing per row", async () => {
    const { adapter, calls } = recorder([{ id: 1 }], 7);
    const page = await adapter.findMany({ model: "User", skip: 25, take: 25 });

    expect(calls.findMany).toHaveBeenCalledTimes(1);
    expect(calls.count).toHaveBeenCalledTimes(1);
    expect(argsOf(calls.findMany)).toEqual({
      skip: 25,
      take: 25,
      orderBy: [{ id: "asc" }],
    });
    expect(page).toEqual({ rows: [{ id: 1 }], total: 7 });
  });

  it("leaves out what was not asked for, apart from the order", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "User" });

    // An empty `where` is not the same request as no `where`, and the second is
    // what a query with no filters means. The order is the exception: it is the
    // adapter's own, not the caller's, because a page without one is not
    // reproducible.
    expect(argsOf(calls.findMany)).toEqual({ orderBy: [{ id: "asc" }] });
  });

  it("turns a filter into a clause", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      clauses: [{ path: "email", operator: "contains", value: "@acme" }],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      email: { contains: "@acme" },
    });
  });

  it("nests a filter that reaches through a relation", async () => {
    // The alternative is a query per row, which nothing here may cost.
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      clauses: [{ path: "author.email", operator: "equals", value: "a@b.c" }],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      author: { email: { equals: "a@b.c" } },
    });
  });

  it("joins several filters with AND", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      clauses: [
        { path: "email", operator: "contains", value: "@acme" },
        { path: "id", operator: "gt", value: 10 },
      ],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      AND: [{ email: { contains: "@acme" } }, { id: { gt: 10 } }],
    });
  });

  it("searches exactly the paths it was given", async () => {
    // Every string column would reach a password hash or a token: rows come
    // back on a match nobody can see, and `search=a`, `search=ab` narrows a
    // secret down from which rows return. Which paths are allowed is settled
    // where the declaration is read; this applies them.
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      search: { term: "ada", paths: ["name", "email"] },
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      OR: [
        { name: { contains: "ada", mode: "insensitive" } },
        { email: { contains: "ada", mode: "insensitive" } },
      ],
    });
  });

  it("reaches through a relation without a second query", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      search: { term: "ada", paths: ["author.name"] },
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      author: { name: { contains: "ada", mode: "insensitive" } },
    });
  });

  it("says nothing when one path was allowed and it is the only one", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "User", search: { term: "ada", paths: ["name"] } });

    // No `OR` around a single clause: it is the same question asked twice.
    expect(argsOf(calls.findMany)["where"]).toEqual({
      name: { contains: "ada", mode: "insensitive" },
    });
  });

  it("searches nothing when no path was allowed", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "User", search: { term: "ada", paths: [] } });

    // The page still comes back; it is the `where` that has nothing to say.
    expect(argsOf(calls.findMany)).toEqual({ orderBy: [{ id: "asc" }] });
  });

  it("sorts, through a relation as well", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      sort: [
        { path: "createdAt", direction: "desc" },
        { path: "author.email", direction: "asc" },
      ],
    });

    expect(argsOf(calls.findMany)["orderBy"]).toEqual([
      { createdAt: "desc" },
      { author: { email: "asc" } },
      // The tiebreaker, taking the direction of the sort it follows.
      { id: "asc" },
    ]);
  });

  it("breaks a tie on the primary key, so two pages cannot repeat a row", async () => {
    // Ordering by a column that is not unique leaves rows with equal values in
    // whatever order the database chose that time. Page 1 and page 2 are two
    // separate queries, so a row can appear in both and another in neither.
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      sort: [{ path: "createdAt", direction: "desc" }],
      skip: 25,
      take: 25,
    });

    expect(argsOf(calls.findMany)["orderBy"]).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("orders by the key alone when nothing was asked", async () => {
    // Prisma would send the same thing here on its own, which is a courtesy
    // and not a contract. The port asks every adapter for a total order.
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Post", skip: 0, take: 25 });

    expect(argsOf(calls.findMany)["orderBy"]).toEqual([{ id: "asc" }]);
  });

  it("does not repeat the key when the sort already ends on it", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Post", sort: [{ path: "id", direction: "asc" }] });

    expect(argsOf(calls.findMany)["orderBy"]).toEqual([{ id: "asc" }]);
  });

  it("turns an include plan into one nested include", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      include: { author: true, comments: { author: true } },
    });

    expect(argsOf(calls.findMany)["include"]).toEqual({
      author: true,
      comments: { include: { author: true } },
    });
  });
});

describe("what a read leaves out", () => {
  it("leaves marked rows out without being asked", async () => {
    // The default everywhere, and named rather than assumed: a default that
    // changed with the caller is one nobody could predict.
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Note" });

    expect(argsOf(calls.findMany)).toMatchObject({ where: { deletedAt: null } });
  });

  it("brings them back when a reader asks for them", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Note", deleted: "with" });

    expect(JSON.stringify(argsOf(calls.findMany))).not.toContain("deletedAt");
  });

  it("shows only those when that is the question", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Note", deleted: "only" });

    expect(argsOf(calls.findMany)).toMatchObject({
      where: { deletedAt: { not: null } },
    });
  });

  it("says nothing about a model with no such column", async () => {
    // A `where` on a column the table has not got is an error, not a filter
    // that matches everything.
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "User" });

    expect(JSON.stringify(argsOf(calls.findMany))).not.toContain("deletedAt");
  });

  it("keeps a declared filter on the tombstone rather than overwriting it", async () => {
    // Under the same key, a spread would have replaced it — silently, which is
    // a filter somebody wrote that stops doing anything.
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Note",
      clauses: [{ path: "deletedAt", operator: "equals", value: null }],
    });

    const where = argsOf(calls.findMany)["where"] as { AND?: unknown[] };
    expect(where.AND).toHaveLength(2);
  });

  it("counts what it reads, not what it left out", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Note" });

    expect(argsOf(calls.count)).toMatchObject({ where: { deletedAt: null } });
  });
});

describe("what a read leaves out of a relation", () => {
  it("filters the rows it loads inside the parents", async () => {
    // The reason this is its own decision: a page that filters its own rows and
    // loads a relation that does not has filtered nothing that matters — the
    // deleted children arrive inside the parents.
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "User", include: { notes: true } });

    expect(argsOf(calls.findMany)).toMatchObject({
      include: { notes: { where: { deletedAt: null } } },
    });
  });

  it("asks for a relation with nothing to mark plainly", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({ model: "Post", include: { author: true } });

    expect(argsOf(calls.findMany)).toMatchObject({ include: { author: true } });
  });

  it("carries the reader's question down with it", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      include: { notes: true },
      deleted: "with",
    });

    expect(JSON.stringify(argsOf(calls.findMany))).not.toContain("deletedAt");
  });
});

describe("reading one row", () => {
  it("looks it up by the key the model declares", async () => {
    const { adapter, calls } = recorder([{ id: 3 }]);
    await adapter.findOne("User", 3);

    expect(argsOf(calls.findUnique)).toEqual({ where: { id: 3 } });
  });

  it("answers null rather than undefined when there is none", async () => {
    const { adapter } = recorder([]);

    expect(await adapter.findOne("User", 99)).toBeNull();
  });
});

describe("writing", () => {
  it("passes the flat values straight through", async () => {
    const { adapter, calls } = recorder();
    await adapter.create("User", { set: { email: "a@b.c" } });

    expect(argsOf(calls.create)).toEqual({ data: { email: "a@b.c" } });
  });

  it("names the row it updates", async () => {
    const { adapter, calls } = recorder();
    await adapter.update("User", 3, { set: { email: "a@b.c" } });

    expect(argsOf(calls.update)).toEqual({
      where: { id: 3 },
      data: { email: "a@b.c" },
    });
  });

  it("turns a relation write into Prisma's nested form", async () => {
    const { adapter, calls } = recorder();
    await adapter.create("User", {
      set: { email: "a@b.c" },
      relations: {
        posts: {
          create: [{ set: { title: "One" } }],
          connect: [7],
          disconnect: [8],
          update: [{ id: 9, data: { set: { title: "Two" } } }],
          delete: [10],
        },
      },
    });

    expect(argsOf(calls.create)["data"]).toEqual({
      email: "a@b.c",
      posts: {
        create: [{ title: "One" }],
        connect: [{ id: 7 }],
        disconnect: [{ id: 8 }],
        update: [{ where: { id: 9 }, data: { title: "Two" } }],
        delete: [{ id: 10 }],
      },
    });
  });

  it("sends a single value on a to-one relation, not a list", async () => {
    // Prisma refuses a list where it expects one row — `Expected
    // UserWhereUniqueInput, provided (Object)` — and a recorder does not.
    const { adapter, calls } = recorder();
    await adapter.create("Post", {
      set: { title: "One" },
      relations: { author: { connect: [7], update: [{ id: 7, data: { set: {} } }] } },
    });

    expect(argsOf(calls.create)["data"]).toEqual({
      title: "One",
      author: { connect: { id: 7 }, update: { where: { id: 7 }, data: {} } },
    });
  });

  it("refuses more than one row on a to-one relation", async () => {
    const { adapter } = recorder();

    await expect(
      adapter.create("Post", {
        set: {},
        relations: { author: { connect: [7, 8] } },
      }),
    ).rejects.toThrow(/to-one relation: connect takes exactly one row, got 2/);
  });

  it("names a nested row by the target model's own key", async () => {
    // Assuming `id` works until somebody has a `uuid`, and then it fails at the
    // database rather than here.
    const { client, calls } = recorder();
    const renamed: Ir = {
      models: FIXTURE_IR.models.map((model) =>
        model.name === "Post"
          ? { ...model, primaryKey: { ...model.primaryKey, name: "uuid" } }
          : model,
      ),
    };

    await new PrismaDataAdapter({ client, ir: renamed }).create("User", {
      set: { email: "a@b.c" },
      relations: { posts: { connect: ["abc"], delete: ["def"] } },
    });

    expect(argsOf(calls.create)["data"]).toEqual({
      email: "a@b.c",
      posts: { connect: [{ uuid: "abc" }], delete: [{ uuid: "def" }] },
    });
  });

  it("refuses a relation the model does not have", async () => {
    const { adapter } = recorder();

    await expect(
      adapter.create("User", { set: {}, relations: { nope: { connect: [1] } } }),
    ).rejects.toThrow(/no relation named nope/);
  });

  it("marks a soft-deleting model rather than destroying it", async () => {
    // What the pin here used to assert, changed on purpose: the record that
    // held deletion hard said this test was what would make the change legible
    // in a diff rather than let it start quietly.
    const { adapter, calls } = recorder();

    expect(adapter.meta("Note").hasSoftDelete).toBe(true);
    await adapter.delete("Note", [4]);

    expect(calls.deleteMany).not.toHaveBeenCalled();
    const args = argsOf(calls.updateMany) as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where["id"]).toEqual({ in: [4] });
    // Only the ones not already marked, so the count is rows that moved.
    expect(args.where["deletedAt"]).toBeNull();
    expect(args.data["deletedAt"]).toBeInstanceOf(Date);
  });

  it("destroys a model that has nothing to mark", async () => {
    const { adapter, calls } = recorder();

    expect(adapter.meta("User").hasSoftDelete).toBe(false);
    await adapter.delete("User", [4]);

    expect(argsOf(calls.deleteMany)).toEqual({ where: { id: { in: [4] } } });
    expect(calls.updateMany).not.toHaveBeenCalled();
  });

  it("destroys a soft-deleting model when asked to force it", async () => {
    const { adapter, calls } = recorder();

    await adapter.forceDelete("Note", [4]);

    expect(argsOf(calls.deleteMany)).toEqual({ where: { id: { in: [4] } } });
    expect(calls.updateMany).not.toHaveBeenCalled();
  });

  it("clears the mark on a restore, and only where there is one", async () => {
    const { adapter, calls } = recorder();

    await adapter.restore("Note", [4]);

    const args = argsOf(calls.updateMany) as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where["deletedAt"]).toEqual({ not: null });
    expect(args.data["deletedAt"]).toBeNull();
  });

  it("restores nothing on a model with no mark, rather than pretending", async () => {
    const { adapter, calls } = recorder();

    expect(await adapter.restore("User", [4])).toBe(0);
    expect(calls.updateMany).not.toHaveBeenCalled();
  });

  it("marks a soft-deleting child a nested write removed", async () => {
    // The same word one click apart: a row taken out of a repeater and a row a
    // delete action removes are both a row somebody deleted. Before this, the
    // repeater destroyed and the action only hid.
    const { adapter, calls } = recorder();

    await adapter.update("User", 1, { set: {}, relations: { notes: { delete: [7] } } });

    const data = (argsOf(calls.update) as { data: Record<string, unknown> }).data;
    const notes = data["notes"] as Record<string, unknown>;
    expect(notes["delete"]).toBeUndefined();
    expect(notes["updateMany"]).toMatchObject([{ where: { id: { in: [7] } } }]);
  });

  it("still destroys a child with nothing to mark", async () => {
    const { adapter, calls } = recorder();

    await adapter.update("User", 1, { set: {}, relations: { posts: { delete: [7] } } });

    const data = (argsOf(calls.update) as { data: Record<string, unknown> }).data;
    expect((data["posts"] as Record<string, unknown>)["delete"]).toEqual([{ id: 7 }]);
  });

  it("removes a child the way the port removes a row, not another way", async () => {
    // What this pin was watching for, and it worked: it said a version that
    // changed `delete()` and left `WriteTree.relations.*.delete` alone would
    // slip past a pin looking at only one of them. That version was written.
    // Both mark now, so the two routes cannot drift again without one of these
    // two assertions failing.
    const { adapter, calls } = recorder();
    await adapter.update("User", 1, {
      set: {},
      relations: { notes: { delete: [4] } },
    });

    const nested = (argsOf(calls.update)["data"] as Record<string, unknown>)["notes"];
    expect(Object.keys(nested as object)).toEqual(["updateMany"]);

    await adapter.delete("Note", [4]);
    expect(calls.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes by key and answers how many went", async () => {
    const { adapter, calls } = recorder();

    expect(await adapter.delete("User", [1, 2])).toBe(2);
    expect(argsOf(calls.deleteMany)).toEqual({ where: { id: { in: [1, 2] } } });
  });
});

describe("a transaction", () => {
  it("refuses to nest, because Prisma does not", async () => {
    // Prisma's transaction client denies `$transaction`. Without this the
    // failure is about a method that is missing on purpose.
    const { adapter } = recorder();

    await expect(
      adapter.transaction(async (tx) => tx.transaction(() => Promise.resolve(1))),
    ).rejects.toThrow(/does not nest/);
  });

  it("hands back an adapter, not the client", async () => {
    // Whatever runs inside has to speak the port, or a nested write would have
    // to know it is talking to Prisma.
    const { adapter } = recorder([{ id: 1 }]);
    const inside = await adapter.transaction(async (tx) => {
      await tx.create("User", { set: { email: "a@b.c" } });
      return tx;
    });

    expect(inside).toBeInstanceOf(PrismaDataAdapter);
    expect(inside.ir()).toBe(adapter.ir());
  });
});

describe("the IR it was built from", () => {
  it("answers from the IR it was given", () => {
    const { adapter } = recorder();

    expect(adapter.ir()).toBe(FIXTURE_IR);
    expect(adapter.meta("User").primaryKey.name).toBe("id");
  });

  it("refuses a model the schema does not have", () => {
    const { adapter } = recorder();

    expect(() => adapter.meta("Nope")).toThrow(/no model named Nope/);
  });
});

/**
 * A narrowing that names a relation rather than a column.
 *
 * A many-to-many has a foreign key on neither side — the join table is the
 * database's — so what scopes a relation manager to its parent cannot be a
 * clause. It is the one narrowing a request must never be able to write, which
 * is why it is a field of its own rather than an operator a filter could reach.
 */
describe("narrowing by a join", () => {
  it("asks whether the row is joined to that one, and not whether all are", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      joinedTo: { relation: "posts", key: "id", value: 4 },
    });

    // `some`, not `every`: `every` is also true of a row joined to nothing.
    expect(argsOf(calls.findMany)).toEqual({
      where: { posts: { some: { id: 4 } } },
      orderBy: [{ id: "asc" }],
    });
  });

  it("stands beside the filters rather than instead of them", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      clauses: [{ path: "name", operator: "contains", value: "ada" }],
      joinedTo: { relation: "posts", key: "id", value: 4 },
    });

    expect(argsOf(calls.findMany)).toEqual({
      where: {
        AND: [{ name: { contains: "ada" } }, { posts: { some: { id: 4 } } }],
      },
      orderBy: [{ id: "asc" }],
    });
  });
});

describe("narrowing to the other side of a join", () => {
  it("asks for the rows joined to nothing of that one, not for all of them", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      joinedTo: { relation: "posts", key: "id", value: 4, holding: "apart" },
    });

    // `none`, not a negated `some` and not `every`: `every` is true of a row
    // joined to nothing at all, which would be every unrelated row on the page.
    expect(argsOf(calls.findMany)).toEqual({
      where: { posts: { none: { id: 4 } } },
      orderBy: [{ id: "asc" }],
    });
  });
});

describe("what an aggregate sends, and what it makes of the answer", () => {
  it("folds every function naming a column into one call", async () => {
    const { adapter, calls } = recorder();
    await adapter.aggregate({
      model: "Post",
      aggregations: {
        filled: { fn: "count", path: "title" },
        total: { fn: "sum", path: "authorId" },
        typical: { fn: "avg", path: "authorId" },
        lowest: { fn: "min", path: "authorId" },
        highest: { fn: "max", path: "authorId" },
      },
    });

    expect(calls.aggregate).toHaveBeenCalledTimes(1);
    expect(argsOf(calls.aggregate)).toEqual({
      _count: { title: true },
      _sum: { authorId: true },
      _avg: { authorId: true },
      _min: { authorId: true },
      _max: { authorId: true },
    });
  });

  it("asks the same column twice under one key, not twice", async () => {
    const { adapter, calls } = recorder();
    await adapter.aggregate({
      model: "Post",
      aggregations: {
        lowest: { fn: "min", path: "authorId" },
        earliest: { fn: "min", path: "id" },
      },
    });

    expect(argsOf(calls.aggregate)).toEqual({ _min: { authorId: true, id: true } });
  });

  it("counts rows through `count`, which a database has already accepted", async () => {
    // Not an argument shape invented here to fold a row count into the
    // aggregate call: this is the one the page total was already using.
    const { adapter, calls } = recorder([], 7);
    const answer = await adapter.aggregate({
      model: "Post",
      aggregations: { rows: { fn: "count" } },
    });

    expect(answer).toEqual({ rows: 7 });
    expect(calls.count).toHaveBeenCalledTimes(1);
    expect(calls.aggregate).not.toHaveBeenCalled();
  });

  it("takes two statements for a row count and a column count, and says so", async () => {
    const { adapter, calls } = recorder([], 7, { _count: { title: 4 } });
    expect(
      await adapter.aggregate({
        model: "Post",
        aggregations: { rows: { fn: "count" }, titled: { fn: "count", path: "title" } },
      }),
    ).toEqual({ rows: 7, titled: 4 });
    expect(calls.count).toHaveBeenCalledTimes(1);
    expect(calls.aggregate).toHaveBeenCalledTimes(1);
  });

  it("narrows by the same clauses a page would, and by the same liveness", async () => {
    const { adapter, calls } = recorder();
    await adapter.aggregate({
      model: "Note",
      clauses: [{ path: "body", operator: "contains", value: "hop" }],
      aggregations: { rows: { fn: "count" } },
    });

    // The tombstone clause and the declared one, both kept: a footer that
    // counted deleted rows the page above it hides is the same bug one level
    // down.
    expect(argsOf(calls.count)).toEqual({
      where: { AND: [{ body: { contains: "hop" } }, { deletedAt: null }] },
    });
  });

  it("answers null where there was no row, rather than zero", async () => {
    const { adapter } = recorder([], 0, { _sum: { authorId: null } });
    expect(
      await adapter.aggregate({
        model: "Post",
        aggregations: { total: { fn: "sum", path: "authorId" } },
      }),
    ).toEqual({ total: null });
  });

  it("keeps a date a date, and widens what a double would round", async () => {
    // A bigint and Prisma's Decimal both print themselves exactly. Neither
    // survives a double, so both leave as strings.
    const when = new Date("2026-03-04T05:06:07.000Z");
    const decimal = { toFixed: () => "1.25", toString: () => "1234.56789012345678" };
    const { adapter } = recorder([], 0, {
      _min: { deletedAt: when },
      _max: { id: 9_007_199_254_740_993n },
      _sum: { id: decimal },
    });

    expect(
      await adapter.aggregate({
        model: "Note",
        aggregations: {
          first: { fn: "min", path: "deletedAt" },
          biggest: { fn: "max", path: "id" },
          exact: { fn: "sum", path: "id" },
        },
      }),
    ).toEqual({
      first: when,
      biggest: "9007199254740993",
      exact: "1234.56789012345678",
    });
  });

  it("refuses an aggregation the model cannot bear, before touching the client", async () => {
    const { adapter, calls } = recorder();
    await expect(
      adapter.aggregate({
        model: "Note",
        aggregations: { when: { fn: "sum", path: "deletedAt" } },
      }),
    ).rejects.toThrow(/deletedAt.*DateTime column/s);

    expect(calls.aggregate).not.toHaveBeenCalled();
    expect(calls.count).not.toHaveBeenCalled();
  });

  it("names every complaint it has, not only the first", async () => {
    const { adapter } = recorder();
    await expect(
      adapter.aggregate({
        model: "Note",
        aggregations: {
          a: { fn: "sum", path: "deletedAt" },
          b: { fn: "avg", path: "nowhere" },
        },
      }),
    ).rejects.toThrow(/deletedAt[\s\S]*nowhere/);
  });
});

describe("what a grouped read sends, and what it makes of the answer", () => {
  it("groups by the one column, with the rows of each group", async () => {
    const { adapter, calls } = recorder();
    await adapter.groupBy({ model: "Post", by: "title" });

    expect(argsOf(calls.groupBy)).toEqual({ by: ["title"], _count: true });
  });

  it("narrows like any read, liveness included", async () => {
    const { adapter, calls } = recorder();
    await adapter.groupBy({
      model: "Note",
      by: "body",
      // What a page restricts itself with: the keys its own rows hold. A
      // clause like any other, which is why nothing is capped in the adapter.
      clauses: [{ path: "body", operator: "in", value: ["one", "two"] }],
    });

    expect(argsOf(calls.groupBy)).toEqual({
      by: ["body"],
      where: { AND: [{ body: { in: ["one", "two"] } }, { deletedAt: null }] },
      _count: true,
    });
  });

  it("answers a key and a size per group", async () => {
    const { adapter } = recorder([], 0, {}, [
      { title: "Ada", _count: 3 },
      { title: "Grace", _count: 1 },
    ]);

    expect(await adapter.groupBy({ model: "Post", by: "title" })).toEqual([
      { key: "Ada", total: 3 },
      { key: "Grace", total: 1 },
    ]);
  });

  it("keeps a group of rows holding nothing, rather than dropping it", async () => {
    // A grouping that lost these would hide rows from a list that says it is
    // showing them.
    const { adapter } = recorder([], 0, {}, [{ title: null, _count: 2 }]);

    expect(await adapter.groupBy({ model: "Post", by: "title" })).toEqual([
      { key: null, total: 2 },
    ]);
  });

  it("keeps a boolean key a boolean, and widens what a double would round", async () => {
    const decimal = { toString: () => "1234.56789012345678" };
    const { adapter } = recorder([], 0, {}, [
      { title: true, _count: 1 },
      { title: 9_007_199_254_740_993n, _count: 1 },
      { title: decimal, _count: 1 },
    ]);

    expect(await adapter.groupBy({ model: "Post", by: "title" })).toEqual([
      { key: true, total: 1 },
      { key: "9007199254740993", total: 1 },
      { key: "1234.56789012345678", total: 1 },
    ]);
  });

  it("refuses a column that gathers nothing, before touching the client", async () => {
    const { adapter, calls } = recorder();
    await expect(
      adapter.groupBy({ model: "Note", by: "deletedAt" }),
    ).rejects.toThrow(/deletedAt.*timestamp/s);

    expect(calls.groupBy).not.toHaveBeenCalled();
  });
});

describe("what a row may hold by the time anybody serialises it", () => {
  /** What the panel does to every row it sends, and what a bigint does to it. */
  const crosses = (value: unknown): boolean => {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  };

  it("widens a bigint column to a string, so a row can be sent at all", async () => {
    const { adapter } = recorder([
      { id: 1, body: "one", tally: 9_007_199_254_740_993n },
    ]);
    const page = await adapter.findMany({ model: "Note" });

    expect(crosses(page.rows)).toBe(true);
    expect(page.rows[0]?.["tally"]).toBe("9007199254740993");
  });

  it("keeps every digit, which is the reason it is not a number", async () => {
    // Past the safe integer, so a number would come back as a different value
    // and a key would address a different row.
    const { adapter } = recorder([{ id: 1, tally: 9_007_199_254_740_993n }]);
    const [row] = (await adapter.findMany({ model: "Note" })).rows;

    // Compared as text, because the comparison cannot be written as a number:
    // the literal 9_007_199_254_740_993 is itself rounded in JavaScript, so a
    // test asserting against it would be asserting against the loss.
    expect(row?.["tally"]).toBe("9007199254740993");
    expect(String(Number(row?.["tally"]))).toBe("9007199254740992");
  });

  it("leaves a date and a decimal exactly as they came", async () => {
    // The two a value-walking conversion would have destroyed: a `Date` into
    // an empty object, a Decimal into its internals.
    const when = new Date("2026-03-04T05:06:07.000Z");
    const decimal = { toJSON: () => "1.25", toString: () => "1.25" };
    const { adapter } = recorder([
      { id: 1, tally: 1n, deletedAt: when, body: decimal },
    ]);
    const [row] = (await adapter.findMany({ model: "Note" })).rows;

    expect(row?.["deletedAt"]).toBe(when);
    expect(row?.["body"]).toBe(decimal);
  });

  it("reaches the rows of a relation the include plan loaded", async () => {
    // A nested row goes through `JSON.stringify` with its parent, so a bigint
    // one branch down takes the page down just as surely.
    const { adapter } = recorder([
      { id: 1, name: "Ada", notes: [{ id: 2, body: "one", tally: 10n }] },
    ]);
    const page = await adapter.findMany({ model: "User", include: { notes: true } });
    const notes = page.rows[0]?.["notes"] as readonly Row[] | undefined;

    expect(crosses(page.rows)).toBe(true);
    expect(notes?.[0]?.["tally"]).toBe("10");
  });

  it("reaches a to-one relation as well as a list of them", async () => {
    // The parent carries no `BigInt` and the row at the end of the to-one
    // does, which is the only shape where crossing that side changes
    // anything. Written the other way round, with a target carrying none, a
    // conversion that skipped the to-one entirely passed this test.
    const { adapter } = recorder([
      { id: 1, title: "about", note: { id: 2, body: "one", tally: 11n } },
    ]);
    const page = await adapter.findMany({ model: "Post", include: { note: true } });
    const note = page.rows[0]?.["note"] as Row | undefined;

    expect(crosses(page.rows)).toBe(true);
    expect(note?.["tally"]).toBe("11");
  });

  it("reaches a list of them, for a column holding several", async () => {
    // A `BigInt[]`, which the schema admits and which arrives as an array of
    // bigints. One of them is enough to take the page down.
    const { adapter } = recorder([{ id: 1, tallies: [1n, 2n] }]);
    const page = await adapter.findMany({ model: "Note" });

    expect(crosses(page.rows)).toBe(true);
    expect(page.rows[0]?.["tallies"]).toEqual(["1", "2"]);
  });

  it("hands back the same rows where no column could hold one", async () => {
    // The common case, and it allocates nothing: almost no model carries a
    // `BigInt`, and a conversion that rebuilt every row of every page anyway
    // would be a cost paid by everybody for nobody.
    const rows = [{ id: 1, title: "Ada" }];
    const { adapter } = recorder(rows);
    const page = await adapter.findMany({ model: "Post" });

    expect(page.rows).toBe(rows);
  });

  it("widens what create and update answer, and what findOne does", async () => {
    const { adapter } = recorder([{ id: 1, body: "one", tally: 7n }]);

    expect((await adapter.findOne("Note", 1))?.["tally"]).toBe("7");
    expect(
      (await adapter.create("Note", { set: { tally: 7n } }))["tally"],
    ).not.toBe(7n);
  });
});
