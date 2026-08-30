/**
 * The adapter's job is translation: a `Query` in, Prisma arguments out. These
 * assert the arguments, against a client that records them.
 *
 * What they cannot say is whether Prisma accepts those arguments — a recorder
 * accepts anything. `tooling/database.test.ts` runs them against a real
 * PostgreSQL and is what caught the to-one relation shape below.
 */
import { describe, expect, it, vi } from "vitest";
import type { Ir } from "@perchjs/core";
import type { PrismaClientLike, PrismaDelegate } from "./prisma-data-adapter.js";
import { delegateName, PrismaDataAdapter } from "./prisma-data-adapter.js";
import { FIXTURE_IR } from "./__fixtures__/ir.js";

interface Recorder {
  readonly adapter: PrismaDataAdapter;
  readonly calls: Record<keyof PrismaDelegate, ReturnType<typeof vi.fn>>;
  readonly client: PrismaClientLike;
}

function recorder(rows: unknown[] = [], total = 0): Recorder {
  const calls = {
    findMany: vi.fn(() => Promise.resolve(rows)),
    findUnique: vi.fn(() => Promise.resolve(rows[0] ?? null)),
    count: vi.fn(() => Promise.resolve(total)),
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
