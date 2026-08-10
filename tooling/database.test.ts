/**
 * What every other Prisma test in this repository cannot say: that PostgreSQL
 * accepts the arguments the adapter produces.
 *
 * The unit tests assert translation against a client that records calls. They
 * would pass just as happily on arguments Prisma rejects. These run the whole
 * chain — schema → generated IR → adapter → database — and the last test
 * measures the one thing invariant 7 forbids.
 *
 * It lives in tooling/ rather than in a package because it spans two of them:
 * the IR comes from @perchjs/prisma-generator and the queries from
 * @perchjs/prisma, and no package may depend on the other.
 *
 * Without DATABASE_URL it skips — except in CI, where a skip would be a hole
 * rather than a convenience, so the first test fails instead.
 */
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataAdapter, Id, Ir, Row } from "@perchjs/core";
import { PrismaDataAdapter } from "@perchjs/prisma";

const DATABASE_URL = process.env["DATABASE_URL"];
const IN_CI = process.env["CI"] === "true" || process.env["CI"] === "1";

describe("the database these tests need", () => {
  it("is provided whenever CI runs them", () => {
    if (!IN_CI) return;
    expect(
      DATABASE_URL,
      "CI must start a PostgreSQL service and export DATABASE_URL: skipping " +
        "these silently would leave the adapter unproven while the run stays green",
    ).toBeDefined();
  });
});

const withDatabase = DATABASE_URL === undefined ? describe.skip : describe;

/** Every statement the driver actually sent, which is what N+1 is counted in. */
const statements: string[] = [];

const textOf = (arg: unknown): string =>
  typeof arg === "string" ? arg : ((arg as { text?: string })?.text ?? "");

/**
 * Counts every statement exactly once, at the connection.
 *
 * Wrapping `pool.query` misses anything transactional: Prisma runs a
 * transaction on a client checked out of the pool, and those statements never
 * pass through it — a page that moved inside one would read as zero and the
 * guard below would pass by measuring nothing. Wrapping both routes instead
 * double-counts, because `pool.query` borrows an idle client and calls the very
 * method already wrapped. The `connect` event fires once per new connection,
 * whichever route later borrows it, so it is the one place both meet.
 */
function record(target: pg.Pool): void {
  target.on("connect", (client) => {
    const sent = client.query.bind(client);
    client.query = ((...args: unknown[]) => {
      statements.push(textOf(args[0]));
      return (sent as (...a: unknown[]) => unknown)(...args);
    }) as typeof client.query;
  });
}

let pool: pg.Pool;
let client: { $disconnect: () => Promise<void> };
let adapter: DataAdapter;

beforeAll(async () => {
  if (DATABASE_URL === undefined) return;

  pool = new pg.Pool({ connectionString: DATABASE_URL });
  record(pool);

  // Imported here, not at the top: `.generated/` is a build output, and a
  // static import would break the file for anyone who has never run the
  // generator — including when this suite is meant to skip.
  const { PrismaClient } = (await import("./.generated/client/index.js")) as {
    PrismaClient: new (options: unknown) => Record<string, never>;
  };
  const { IR } = (await import("./.generated/ir.ts")) as { IR: Ir };

  client = new PrismaClient({ adapter: new PrismaPg(pool) }) as never;
  adapter = new PrismaDataAdapter({ client: client as never, ir: IR });

  await adapter.delete("Comment", await ids("Comment"));
  await adapter.delete("Post", await ids("Post"));
  await adapter.delete("Author", await ids("Author"));
  await adapter.delete("Country", await ids("Country"));
}, 120_000);

afterAll(async () => {
  await client?.$disconnect();
  await pool?.end();
});

async function ids(model: string): Promise<Id[]> {
  const page = await adapter.findMany({ model });
  return page.rows.map((row) => row["id"] as Id);
}

/** Statements sent while `run` was in flight, and nothing before it. */
async function count<T>(run: () => Promise<T>): Promise<[T, number]> {
  statements.length = 0;
  const value = await run();
  return [value, statements.length];
}

withDatabase("reading, against a real database", () => {
  let author: Row;

  beforeAll(async () => {
    const france = await adapter.create("Country", { set: { name: "France" } });
    author = await adapter.create("Author", {
      set: { email: "ada@example.com", name: "Ada Lovelace" },
      relations: { country: { connect: [france["id"] as Id] } },
    });
    for (let i = 0; i < 4; i += 1) {
      await adapter.create("Post", {
        set: { title: `Post ${i}`, published: i % 2 === 0 },
        relations: {
          author: { connect: [author["id"] as Id] },
          comments: {
            create: [{ set: { body: "first" } }, { set: { body: "second" } }],
          },
        },
      });
    }
  }, 60_000);

  it("runs a filter, a sort and an include through relations in one request", async () => {
    // Every one of these is a translation the unit tests assert and no unit
    // test can execute.
    const page = await adapter.findMany({
      model: "Post",
      filters: [{ path: "author.email", operator: "equals", value: "ada@example.com" }],
      sort: [{ path: "author.name", direction: "asc" }],
      include: { author: true, comments: true },
      take: 10,
    });

    expect(page.total).toBe(4);
    expect(page.rows).toHaveLength(4);
    expect(page.rows[0]?.["author"]).toMatchObject({ name: "Ada Lovelace" });
    expect(page.rows[0]?.["comments"]).toHaveLength(2);
  });

  it("pages without losing the total", async () => {
    const page = await adapter.findMany({ model: "Post", skip: 2, take: 2 });

    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("searches the label field, case-insensitively", async () => {
    const page = await adapter.findMany({ model: "Author", search: "lovelace" });

    expect(page.total).toBe(1);
  });

  it("finds one row by its key, and answers null for a key with no row", async () => {
    expect(await adapter.findOne("Author", author["id"] as Id)).toMatchObject({
      email: "ada@example.com",
    });
    expect(await adapter.findOne("Author", 999_999)).toBeNull();
  });
});

withDatabase("writing, against a real database", () => {
  it("creates, updates and deletes a row", async () => {
    const created = await adapter.create("Country", { set: { name: "Portugal" } });
    const updated = await adapter.update("Country", created["id"] as Id, {
      set: { name: "Portugal " },
    });

    expect(updated["name"]).toBe("Portugal ");
    expect(await adapter.delete("Country", [created["id"] as Id])).toBe(1);
    expect(await adapter.findOne("Country", created["id"] as Id)).toBeNull();
  });

  it("runs every nested write Prisma's form allows", async () => {
    const author = await adapter.create("Author", {
      set: { email: "grace@example.com", name: "Grace" },
      relations: {
        posts: { create: [{ set: { title: "Kept" } }, { set: { title: "Doomed" } }] },
      },
    });
    const posts = await adapter.findMany({
      model: "Post",
      filters: [{ path: "authorId", operator: "equals", value: author["id"] }],
    });
    const doomed = posts.rows.find((row) => row["title"] === "Doomed");

    await adapter.update("Author", author["id"] as Id, {
      set: {},
      relations: {
        posts: {
          update: [
            {
              id: posts.rows.find((row) => row["title"] === "Kept")?.["id"] as Id,
              data: { set: { published: true } },
            },
          ],
          delete: [doomed?.["id"] as Id],
        },
      },
    });

    const after = await adapter.findMany({
      model: "Post",
      filters: [{ path: "authorId", operator: "equals", value: author["id"] }],
    });
    expect(after.total).toBe(1);
    expect(after.rows[0]).toMatchObject({ title: "Kept", published: true });
  });

  it("rolls the whole tree back when a nested write fails", async () => {
    // The guarantee A3 rests on: a half-written repeater must not survive.
    const before = await adapter.findMany({ model: "Country" });

    await expect(
      adapter.transaction(async (tx) => {
        await tx.create("Country", { set: { name: "Atlantis" } });
        // Same unique name, so the second insert is refused by the database.
        await tx.create("Country", { set: { name: "Atlantis" } });
      }),
    ).rejects.toThrow();

    const after = await adapter.findMany({ model: "Country" });
    expect(after.total).toBe(before.total);
  });
});

withDatabase("invariant 7 — no query per row", () => {
  async function seed(from: number, to: number): Promise<void> {
    const author = await adapter.create("Author", {
      set: { email: `bulk${from}@example.com`, name: `Bulk ${from}` },
    });
    for (let i = from; i < to; i += 1) {
      await adapter.create("Post", {
        set: { title: `Bulk ${i}` },
        relations: {
          author: { connect: [author["id"] as Id] },
          comments: { create: [{ set: { body: "one" } }, { set: { body: "two" } }] },
        },
      });
    }
  }

  const page = () =>
    adapter.findMany({
      model: "Post",
      include: { author: true, comments: true },
      take: 100,
    });

  it("costs the same number of statements however many rows come back", async () => {
    // An absolute number would pin Prisma's join strategy, which is its choice
    // to make. What invariant 7 forbids is growth with the row count, so that
    // is what is measured — and relative to whatever the table already holds,
    // because a suite that assumes it owns the table measures its neighbours.
    await seed(0, 5);
    const [small, onSmall] = await count(page);

    await seed(5, 30);
    const [large, onLarge] = await count(page);

    // Non-zero first: the counter reads the driver, and a driver route it does
    // not see would report zero at both sizes and pass by measuring nothing.
    expect(onSmall).toBeGreaterThan(0);
    expect(large.rows.length).toBeGreaterThanOrEqual(small.rows.length + 25);
    expect(onLarge).toBe(onSmall);
  }, 120_000);

  it("counts what a transaction sends, not only what the pool does", async () => {
    // The blind spot this suite nearly shipped with. A transaction runs on a
    // checked-out client; a counter watching only `pool.query` reports zero for
    // it, and every assertion below would then pass by measuring nothing.
    const [, sent] = await count(() =>
      adapter.transaction((tx) =>
        tx.create("Country", { set: { name: `Tx ${String(Math.random())}` } }),
      ),
    );

    expect(sent).toBeGreaterThanOrEqual(3);
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("COMMIT");
  });

  it("keeps that cost to the page, the count, and one query per relation", async () => {
    // Measured at 4: the page, its count, the authors, the comments. `<=`
    // rather than `===` so that Prisma folding these into a join reads as the
    // improvement it would be rather than as a regression.
    const [, sent] = await count(page);

    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThanOrEqual(4);
  });
});
