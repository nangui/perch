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
      filters: [{ path: "email", operator: "contains", value: "@acme" }],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      email: { contains: "@acme" },
    });
  });

  it("nests a filter that reaches through a relation", async () => {
    // The alternative is a query per row, which invariant 7 forbids.
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "Post",
      filters: [{ path: "author.email", operator: "equals", value: "a@b.c" }],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      author: { email: { equals: "a@b.c" } },
    });
  });

  it("joins several filters with AND", async () => {
    const { adapter, calls } = recorder();
    await adapter.findMany({
      model: "User",
      filters: [
        { path: "email", operator: "contains", value: "@acme" },
        { path: "id", operator: "gt", value: 10 },
      ],
    });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      AND: [{ email: { contains: "@acme" } }, { id: { gt: 10 } }],
    });
  });

  it("searches the one field a human reads, and no other", async () => {
    // Every string column would reach a password hash or a token: rows come
    // back on a match nobody can see, and `search=a`, `search=ab` narrows a
    // secret down from which rows return.
    const { adapter, calls } = recorder();
    const label = adapter.meta("User").labelField;
    await adapter.findMany({ model: "User", search: "ada lovelace" });

    expect(argsOf(calls.findMany)["where"]).toEqual({
      [label]: { contains: "ada lovelace", mode: "insensitive" },
    });
  });

  it("searches nothing when the label is not a string", async () => {
    const { client, calls } = recorder();
    const odd: Ir = {
      models: FIXTURE_IR.models.map((model) =>
        model.name === "User" ? { ...model, labelField: "id" } : model,
      ),
    };
    await new PrismaDataAdapter({ client, ir: odd }).findMany({
      model: "User",
      search: "7",
    });

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

  it("deletes a soft-deleting model exactly like any other", async () => {
    // Pinned, not endorsed. `hasSoftDelete` describes the schema in v0.1 and
    // promises nothing about deletion; v0.2 changes that, and this test is what
    // makes the change show up in a diff rather than start quietly.
    const { adapter, calls } = recorder();

    expect(adapter.meta("Note").hasSoftDelete).toBe(true);
    await adapter.delete("Note", [4]);

    expect(calls.deleteMany).toHaveBeenCalledTimes(1);
    expect(argsOf(calls.deleteMany)).toEqual({ where: { id: { in: [4] } } });
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("deletes a soft-deleting child of a nested write just as plainly", async () => {
    // The other half of the same promise. ADR 0014 names both `delete()` and
    // `WriteTree.relations.*.delete`, and a v0.2 that changed only one of them
    // would slip past a pin that watched the other.
    const { adapter, calls } = recorder();
    await adapter.update("User", 1, {
      set: {},
      relations: { notes: { delete: [4] } },
    });

    expect(argsOf(calls.update)["data"]).toEqual({ notes: { delete: [{ id: 4 }] } });
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
