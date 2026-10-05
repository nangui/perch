/**
 * What every other Prisma test in this repository cannot say: that PostgreSQL
 * accepts the arguments the adapter produces.
 *
 * The unit tests assert translation against a client that records calls. They
 * would pass just as happily on arguments Prisma rejects. These run the whole
 * chain — schema → generated IR → adapter → database — and the last test
 * measures the one cost nothing here may pay: a query per row.
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
import { SCHEMAS } from "./schemas.ts";
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
  typeof arg === "string" ? arg : ((arg as { text?: string } | null)?.text ?? "");

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

let pool: pg.Pool | undefined;
let client: { $disconnect: () => Promise<void> } | undefined;
let adapter: DataAdapter;

beforeAll(async () => {
  if (DATABASE_URL === undefined) return;

  pool = new pg.Pool({ connectionString: DATABASE_URL });
  record(pool);

  // Imported here, not at the top: `.generated/` is a build output, and a
  // static import would break the file for anyone who has never run the
  // generator — including when this suite is meant to skip.
  const { PrismaClient } = (await import("./.generated/client/index.js")) as {
    PrismaClient: new (options: unknown) => { $disconnect: () => Promise<void> };
  };
  const { IR } = (await import("./.generated/ir.ts")) as { IR: Ir };

  client = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMAS.queries }) });
  adapter = new PrismaDataAdapter({ client: client as never, ir: IR });

  // `forceDelete`, because this means destroy: `delete` marks a soft-deleting
  // model now, and a wipe that left the rows behind would collide with its own
  // unique names on the next run.
  await adapter.forceDelete("Comment", await ids("Comment"));
  await adapter.forceDelete("Post", await ids("Post"));
  await adapter.forceDelete("Author", await ids("Author"));
  await adapter.forceDelete("Country", await ids("Country"));
}, 120_000);

afterAll(async () => {
  await client?.$disconnect();
  await pool?.end();
});

/** Marked ones included: a wipe that skipped them would leave them forever. */
async function ids(model: string): Promise<Id[]> {
  const page = await adapter.findMany({ model, deleted: "with" });
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
        set: { title: `Post ${String(i)}`, published: i % 2 === 0 },
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
      clauses: [{ path: "author.email", operator: "equals", value: "ada@example.com" }],
      sort: [{ path: "author.name", direction: "asc" }],
      include: { author: true, comments: true },
      take: 10,
    });

    expect(page.total).toBe(4);
    expect(page.rows).toHaveLength(4);
    expect(page.rows[0]?.["author"]).toMatchObject({ name: "Ada Lovelace" });
    expect(page.rows[0]?.["comments"]).toHaveLength(2);
  });

  it("works out five functions over one set of rows, in one statement", async () => {
    // What no recorder can say: that PostgreSQL accepts these arguments. The
    // statement count is the other half — the port promises one call and the
    // adapter is what decides how few queries that is.
    const [answer, sent] = await count(() =>
      adapter.aggregate({
        model: "Post",
        aggregations: {
          titled: { fn: "count", path: "title" },
          bodied: { fn: "count", path: "body" },
          total: { fn: "sum", path: "authorId" },
          typical: { fn: "avg", path: "authorId" },
          first: { fn: "min", path: "title" },
          last: { fn: "max", path: "title" },
        },
      }),
    );

    expect(sent).toBe(1);
    expect(answer).toMatchObject({
      titled: 4,
      // Every post was created without one, which is the whole difference
      // between counting rows and counting a column.
      bodied: 0,
      typical: author["id"],
      first: "Post 0",
      last: "Post 3",
    });
    expect(answer["total"]).toBe(Number(author["id"]) * 4);
  });

  it("counts rows through the route a page total already used", async () => {
    const [answer, sent] = await count(() =>
      adapter.aggregate({ model: "Post", aggregations: { rows: { fn: "count" } } }),
    );

    expect(answer).toEqual({ rows: 4 });
    expect(sent).toBe(1);
  });

  it("answers null over no rows, and zero only where it counted", async () => {
    // The one a footer gets wrong: a filter nothing matched has no total, and
    // printing 0 would state one nobody worked out.
    expect(
      await adapter.aggregate({
        model: "Post",
        clauses: [{ path: "title", operator: "equals", value: "nothing by this name" }],
        aggregations: {
          rows: { fn: "count" },
          titled: { fn: "count", path: "title" },
          total: { fn: "sum", path: "authorId" },
          typical: { fn: "avg", path: "authorId" },
          first: { fn: "min", path: "title" },
        },
      }),
    ).toEqual({ rows: 0, titled: 0, total: null, typical: null, first: null });
  });

  it("aggregates the rows a clause kept, and no others", async () => {
    expect(
      await adapter.aggregate({
        model: "Post",
        clauses: [{ path: "published", operator: "equals", value: true }],
        aggregations: { rows: { fn: "count" } },
      }),
    ).toEqual({ rows: 2 });
  });

  it("leaves a marked row out of an aggregate, as it leaves it out of a page", async () => {
    const comments = await adapter.findMany({ model: "Comment", take: 100 });
    expect(comments.total).toBe(8);
    await adapter.delete("Comment", [comments.rows[0]?.["id"] as Id]);

    // Soft-deleting, so this is the footer half of what a page already does.
    expect(
      await adapter.aggregate({ model: "Comment", aggregations: { rows: { fn: "count" } } }),
    ).toEqual({ rows: 7 });
    expect(
      await adapter.aggregate({
        model: "Comment",
        deleted: "only",
        aggregations: { rows: { fn: "count" } },
      }),
    ).toEqual({ rows: 1 });

    await adapter.restore("Comment", [comments.rows[0]?.["id"] as Id]);
  });

  it("gathers the rows by a column, in one statement, with each group's size", async () => {
    // What no recorder can say: that PostgreSQL accepts these arguments.
    const [groups, sent] = await count(() =>
      adapter.groupBy({ model: "Post", by: "published" }),
    );

    expect(sent).toBe(1);
    // Four posts, published alternating, so two of each.
    expect([...groups].sort((a, b) => Number(a.key) - Number(b.key))).toEqual([
      { key: false, total: 2 },
      { key: true, total: 2 },
    ]);
  });

  it("is bounded by the caller's clause and not by anything in the adapter", async () => {
    // How a page keeps this cheap: it asks about the keys its own rows hold,
    // which is a clause like any other. Two keys asked for, two groups back,
    // out of the four the table holds.
    const only = await adapter.groupBy({
      model: "Post",
      by: "title",
      clauses: [{ path: "title", operator: "in", value: ["Post 0", "Post 2"] }],
    });

    expect([...only].sort((a, b) => String(a.key).localeCompare(String(b.key)))).toEqual(
      [
        { key: "Post 0", total: 1 },
        { key: "Post 2", total: 1 },
      ],
    );
  });

  it("has no `in` to be bounded by on a boolean, and needs none", async () => {
    // Found here rather than guessed at: Prisma's boolean filter offers
    // `equals` and `not` and no `in`, so a page cannot restrict a grouped read
    // by a list of boolean keys. It does not have to. A boolean's groups are
    // two and a null, which is a bound the column already has, and the same
    // holds for an enum whose values the schema names.
    await expect(
      adapter.groupBy({
        model: "Post",
        by: "published",
        clauses: [{ path: "published", operator: "in", value: [true] }],
      }),
    ).rejects.toThrow(/Unknown argument/);

    const both = await adapter.groupBy({ model: "Post", by: "published" });
    expect(both).toHaveLength(2);
  });

  it("keeps the rows holding nothing as a group of their own", async () => {
    // `body` is nullable and no post was given one, so every row is in it. A
    // grouping that dropped these would hide rows from a list that says it is
    // showing them.
    //
    // Relative to what the table holds rather than a number written here: a
    // suite that assumes it owns the table measures its neighbours, and one
    // below this seeds thirty more rows.
    const whole = await adapter.findMany({ model: "Post", take: 1 });

    expect(await adapter.groupBy({ model: "Post", by: "body" })).toEqual([
      { key: null, total: whole.total },
    ]);
  });

  it("leaves a marked row out of a group, as it leaves it out of a page", async () => {
    const comments = await adapter.findMany({ model: "Comment", take: 100 });
    const first = comments.rows[0]?.["id"] as Id;
    await adapter.delete("Comment", [first]);

    const live = await adapter.groupBy({ model: "Comment", by: "body" });
    const marked = await adapter.groupBy({
      model: "Comment",
      by: "body",
      deleted: "only",
    });

    expect(live.reduce((into, one) => into + one.total, 0)).toBe(comments.total - 1);
    expect(marked.reduce((into, one) => into + one.total, 0)).toBe(1);

    await adapter.restore("Comment", [first]);
  });

  it("refuses to gather by a timestamp, which would be a group per row", async () => {
    await expect(
      adapter.groupBy({ model: "Comment", by: "deletedAt" }),
    ).rejects.toThrow(/timestamp/);
  });

  it("pages without losing the total", async () => {
    const page = await adapter.findMany({ model: "Post", skip: 2, take: 2 });

    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("orders every page by something unique, so two pages cannot overlap", async () => {
    // The acceptance criterion, and the only case that is ours to fix:
    // measured, Prisma appends `ORDER BY "id"` to a limited query that asked
    // for no order at all, but appends nothing to one that named a column.
    //
    // Asserting the *rows* proves nothing here — four rows in a fresh table
    // come back in insertion order whatever the ORDER BY says, and that version
    // of this test passed with the tiebreaker removed. What discriminates is
    // the statement PostgreSQL was actually sent.
    statements.length = 0;
    await adapter.findMany({
      model: "Post",
      sort: [{ path: "published", direction: "asc" }],
      skip: 2,
      take: 2,
    });

    const select = statements.find((sql) => /SELECT/i.test(sql) && /LIMIT/i.test(sql));

    expect(select).toBeDefined();
    expect(select).toMatch(/ORDER BY[\s\S]*"published"[\s\S]*"id"/i);
  });

  it("searches every path it was allowed, in one query", async () => {
    // Two columns, one OR, one statement. A search that costs a query per
    // column is the same N+1 the include plan exists to avoid.
    statements.length = 0;
    const found = await adapter.findMany({
      model: "Post",
      search: { term: "post 1", paths: ["title", "body"] },
    });

    expect(found.total).toBe(1);
    expect(statements.filter((sql) => /SELECT/i.test(sql))).toHaveLength(2);
  });

  it("reaches through a relation, which no unit test can execute", async () => {
    // The nested clause the adapter builds is exactly the shape the unit tests
    // assert and cannot run. Prisma rejects a wrong one.
    const found = await adapter.findMany({
      model: "Post",
      search: { term: "lovelace", paths: ["author.name"] },
    });

    expect(found.total).toBe(4);
  });

  it("finds nothing rather than everything when no path was allowed", async () => {
    const found = await adapter.findMany({
      model: "Post",
      search: { term: "post", paths: [] },
    });

    // Every row, because the search said nothing — not zero rows, and not a
    // search of every column.
    expect(found.total).toBe(4);
  });

  it("searches the label field, case-insensitively", async () => {
    const page = await adapter.findMany({
      model: "Author",
      search: { term: "LOVELACE", paths: ["name"] },
    });

    expect(page.total).toBe(1);
  });

  it("finds one row by its key, and answers null for a key with no row", async () => {
    expect(await adapter.findOne("Author", author["id"] as Id)).toMatchObject({
      email: "ada@example.com",
    });
    expect(await adapter.findOne("Author", 999_999)).toBeNull();
  });
});

withDatabase("the two column types a number cannot hold", () => {
  const mark = (): string => `widen-${String(Date.now())}-${String(Math.random()).slice(2, 7)}`;

  it("hands back a bigint column as a string, because a row holding one is sent", async () => {
    const name = mark();
    await adapter.create("Country", {
      // A string on the way in, which this column takes as readily as a
      // bigint, so the widening on the way out is a conversion rather than a
      // one-way door.
      set: { name, tally: "9007199254740993" },
    });

    // The hazard, measured here rather than asserted in a comment: the driver
    // itself answers a bigint, and `JSON.stringify` refuses one. Every route
    // that draws this column puts the row through it.
    const raw = (await (
      client as unknown as {
        country: { findFirst: (a: unknown) => Promise<{ tally: unknown } | null> };
      }
    ).country.findFirst({ where: { name } }))?.tally;
    expect(typeof raw).toBe("bigint");
    expect(() => JSON.stringify({ raw })).toThrow(/BigInt/);

    const page = await adapter.findMany({
      model: "Country",
      clauses: [{ path: "name", operator: "equals", value: name }],
    });

    expect(() => JSON.stringify(page.rows)).not.toThrow();
    // Every digit, which is the reason it is not a number: this value is past
    // the safe integer, so a double would answer a different one.
    expect(page.rows[0]?.["tally"]).toBe("9007199254740993");
  });

  it("sums a decimal column exactly, which a double does not", async () => {
    // A tenth and a fifth, chosen because they are the arithmetic everybody
    // knows a double gets wrong.
    const run = mark();
    await adapter.create("Country", { set: { name: `${run}-a`, amount: "0.10" } });
    await adapter.create("Country", { set: { name: `${run}-b`, amount: "0.20" } });

    const worked = await adapter.aggregate({
      model: "Country",
      clauses: [{ path: "name", operator: "contains", value: run }],
      aggregations: { total: { fn: "sum", path: "amount" } },
    });
    const total = worked["total"];

    // A string, because that is the only shape that keeps it. An adapter
    // answering a number here has rounded somebody's money.
    expect(typeof total).toBe("string");
    expect(Number(total)).toBe(0.3);
    expect(0.1 + 0.2).not.toBe(Number(total));
  });

  it("sends a decimal in a row, which needs no widening", async () => {
    // Left alone on purpose: a Decimal carries its own `toJSON` and arrives as
    // an exact string, so a conversion reaching into it would be the one that
    // broke something that worked.
    const name = mark();
    await adapter.create("Country", { set: { name, amount: "1234.56" } });
    const page = await adapter.findMany({
      model: "Country",
      clauses: [{ path: "name", operator: "equals", value: name }],
    });

    expect(() => JSON.stringify(page.rows)).not.toThrow();
    expect(JSON.stringify(page.rows[0]?.["amount"])).toBe('"1234.56"');
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
      clauses: [{ path: "authorId", operator: "equals", value: author["id"] }],
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
      clauses: [{ path: "authorId", operator: "equals", value: author["id"] }],
    });
    expect(after.total).toBe(1);
    expect(after.rows[0]).toMatchObject({ title: "Kept", published: true });
  });

  it("marks the row of a soft-deleting model, and the row is still there", async () => {
    // What the pin here used to assert. It said `delete` destroyed and checked
    // that the row read back as null — which both behaviours satisfy, since
    // marking it makes the default read skip it. So the pin never fired. The
    // difference is only visible by asking for the deleted ones.
    const country = await adapter.create("Country", { set: { name: "Atlantis" } });
    const id = country["id"] as Id;

    expect(adapter.meta("Country").hasSoftDelete).toBe(true);
    expect(await adapter.delete("Country", [id])).toBe(1);

    expect(await adapter.findOne("Country", id)).toBeNull();
    expect(await adapter.findOne("Country", id, { deleted: "with" })).toMatchObject({
      name: "Atlantis",
    });
  });

  it("brings a marked row back, and answers what it lifted", async () => {
    const country = await adapter.create("Country", { set: { name: "Lemuria" } });
    const id = country["id"] as Id;
    await adapter.delete("Country", [id]);

    expect(await adapter.restore("Country", [id])).toBe(1);
    expect(await adapter.findOne("Country", id)).toMatchObject({ name: "Lemuria" });
    // Already live: nothing moved, and saying zero is not the same as failing.
    expect(await adapter.restore("Country", [id])).toBe(0);
  });

  it("destroys it for good when asked to force it", async () => {
    const country = await adapter.create("Country", { set: { name: "Mu" } });
    const id = country["id"] as Id;

    expect(await adapter.forceDelete("Country", [id])).toBe(1);
    expect(await adapter.findOne("Country", id, { deleted: "with" })).toBeNull();
  });

  it("leaves a marked row out of a page and out of its total", async () => {
    const kept = await adapter.create("Country", { set: { name: "Kept" } });
    const gone = await adapter.create("Country", { set: { name: "Gone" } });
    await adapter.delete("Country", [gone["id"] as Id]);

    const page = await adapter.findMany({
      model: "Country",
      clauses: [{ path: "id", operator: "in", value: [kept["id"], gone["id"]] }],
    });

    expect(page.rows.map((row) => row["name"])).toEqual(["Kept"]);
    expect(page.total).toBe(1);
  });

  it("marks a child a nested write removed, rather than destroying it", async () => {
    // The route a reader uses most — a row taken out of a repeater. Only the
    // database says whether it is still in the table afterwards, which is why
    // this cannot be settled against a double.
    const author = await adapter.create("Author", {
      set: { email: "nested@example.com", name: "Nested" },
    });
    const post = await adapter.create("Post", {
      set: { title: "Held" },
      relations: {
        author: { connect: [author["id"] as Id] },
        comments: { create: [{ set: { body: "Removed later" } }] },
      },
    });

    const [comment] = (
      await adapter.findMany({
        model: "Comment",
        clauses: [{ path: "postId", operator: "equals", value: post["id"] }],
      })
    ).rows;
    expect(comment).toBeDefined();

    await adapter.update("Post", post["id"] as Id, {
      set: {},
      relations: { comments: { delete: [comment?.["id"] as Id] } },
    });

    // Gone from an ordinary read, still in the table.
    expect(await adapter.findOne("Comment", comment?.["id"] as Id)).toBeNull();
    expect(
      await adapter.findOne("Comment", comment?.["id"] as Id, { deleted: "with" }),
    ).toMatchObject({ body: "Removed later" });
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

withDatabase("no query per row", () => {
  async function seed(from: number, to: number): Promise<void> {
    const author = await adapter.create("Author", {
      set: { email: `bulk${String(from)}@example.com`, name: `Bulk ${String(from)}` },
    });
    for (let i = from; i < to; i += 1) {
      await adapter.create("Post", {
        set: { title: `Bulk ${String(i)}` },
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
    // to make. What may not happen is growth with the row count, so that
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
