/**
 * The p95 budget on `/records`, which could not exist until the route did.
 *
 * The adapter here answers from memory, so what is measured is the panel's own
 * cost: routing, the guard, the user resolver, authorisation, building the query
 * from the string, and JSON out. A slow database is the user's to fix; a slow
 * panel is ours.
 *
 * Twice over, because a table that gathers its rows and totals a column does
 * more than one read. The footer is asked for beside the page, so it costs
 * waiting for the slower of two; the groups are asked for after it, because
 * what bounds that read is the keys the page holds. That is the only place in
 * this chain where a read waits on another, which is why there is a second
 * measurement at all.
 *
 * **What neither measurement can catch, so that nobody reads more into them
 * than is there.** The adapter answers from memory, so a read costs nothing
 * here: a grouping that asked one read per group instead of one per shape
 * would not move either number. How many reads a grouped page makes is held
 * where reads are counted rather than timed — `records-grouped.http.test.ts`
 * holds the count at the port, and `tooling/database.test.ts` holds what one
 * costs in statements against a real database. A ratio between these two
 * numbers was written here, probed, and deleted for naming a regression it
 * could not fail for.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AggregateQuery,
  AggregateResult,
  Clause,
  DataAdapter,
  GroupCount,
  GroupKey,
  GroupQuery,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  Summary,
} from "@perchjs/core";
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { MAX_PER_PAGE } from "./records-query.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const BUDGET_MS = 150;
/**
 * How much more a gathered page may cost than a plain one.
 *
 * Generous on purpose: both are a fraction of a millisecond here, where
 * scheduling noise is a large share of either, so a tight ratio would be a
 * test that fails on a busy runner. What it is for is an order of magnitude,
 * which is what a grouping gone quadratic would be.
 */

const ITERATIONS = 100;
const WARMUP = 20;

/**
 * Three teams and one of them nothing, so a grouped page asks twice: once about
 * the keys it holds and once about the rows holding none. That is the worst
 * shape, and a budget measured on the best one is a budget nobody is holding.
 */
const TEAMS: readonly (string | null)[] = ["swifts", "wrens", null];

/** A full page, because that is the worst a caller may legitimately ask for. */
const ROWS: Row[] = Array.from({ length: MAX_PER_PAGE }, (_, i) => ({
  id: i + 1,
  title: `Row ${String(i)}`,
  body: "x".repeat(120),
  team: TEAMS[i % TEAMS.length] ?? null,
  owed: i * 7,
}));

const POST = model({
  fields: [key(), scalar("title"), scalar("team"), scalar("owed", { type: "Int" })],
});

/** The table the second measurement is of: a footer and a grouping. */
const GATHERED = Table.make()
  .columns([
    TextColumn.make("title"),
    TextColumn.make("owed").summarise("sum", "avg"),
    TextColumn.make("team").summarise("count"),
  ])
  .groupBy("team");

/**
 * Whether a key is one the clauses kept.
 *
 * The two shapes this layer sends and no others: a list of keys, and nothing
 * at all. A double reading more would answer questions nobody asks it.
 */
function kept(key: GroupKey, by: string, clauses: readonly Clause[]): boolean {
  return clauses.every((clause) => {
    // A clause about another column says nothing about this key. Read rather
    // than assumed: without it, a narrowing on any other path would compare
    // its value to the group key and drop every row.
    if (clause.path !== by) return true;
    if (clause.operator === "in") {
      return Array.isArray(clause.value) && clause.value.includes(key);
    }
    if (clause.operator === "equals") return key === clause.value;
    return true;
  });
}

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST] };
  }
  meta(): ModelMeta {
    return POST;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({
      rows: ROWS.slice(0, query.take ?? ROWS.length),
      total: ROWS.length,
    });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(): Promise<Row> {
    throw new Error("not needed here");
  }
  delete(): Promise<number> {
    throw new Error("not needed here");
  }
  /** Not exercised here: a double that answered zero would let a test
   * pass with nothing having happened. */
  forceDelete(): Promise<number> {
    throw new Error("not needed here");
  }
  restore(): Promise<number> {
    throw new Error("not needed here");
  }

  attach(): Promise<void> {
    return Promise.resolve();
  }
  detach(): Promise<void> {
    return Promise.resolve();
  }
  /**
   * Answers for real, both of these. A double that threw would make the second
   * measurement a measurement of a 500, and one that answered nothing would
   * let it pass with the panel having skipped the work.
   */
  aggregate(query: AggregateQuery): Promise<AggregateResult> {
    const answer: Record<string, number> = {};
    for (const [named] of Object.entries(query.aggregations)) answer[named] = 42;
    return Promise.resolve(answer);
  }

  groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
    const totals = new Map<string, GroupCount>();
    for (const row of ROWS) {
      const key = (row[query.by] ?? null) as GroupKey;
      // Honoured, because a grouped page asks twice and a double that answered
      // every group to both would hand back six groups where there are three.
      // Measured: it did, until this line.
      if (!kept(key, query.by, query.clauses ?? [])) continue;
      const under = `${typeof key}:${String(key)}`;
      totals.set(under, { key, total: (totals.get(under)?.total ?? 0) + 1 });
    }
    return Promise.resolve([...totals.values()]);
  }

  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
}

@PanelResource({ model: "Post", slug: "gathered" })
class GatheredResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  table(): Table {
    return GATHERED;
  }
}

let app: INestApplication | undefined;
let base = "";

beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), "perch-records-p95-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  const assets: PanelAssets = {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource, GatheredResource],
        assets,
        dataAdapter: MemoryAdapter,
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  base = await app.getUrl();
}, 60_000);

afterAll(async () => {
  await app?.close();
  app = undefined;
});

interface Answer {
  readonly rows: readonly Row[];
  readonly summaries?: Readonly<Record<string, readonly Summary[]>>;
  readonly groups?: readonly GroupCount[];
}

async function roundTrip(slug = "posts"): Promise<Answer> {
  const response = await fetch(
    `${base}/admin/api/${slug}/records?page=1&perPage=${String(MAX_PER_PAGE)}&sort=title:desc&search=Row`,
  );
  if (!response.ok) throw new Error(`/records answered ${String(response.status)}`);
  return (await response.json()) as Answer;
}

/** The p95 of a hundred round trips, after twenty that are not counted. */
async function measured(slug: string): Promise<number> {
  for (let i = 0; i < WARMUP; i += 1) await roundTrip(slug);

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = performance.now();
    await roundTrip(slug);
    samples.push(performance.now() - started);
  }
  return percentile(samples, 95);
}

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
  );
}

describe("a /records round trip, end to end", () => {
  it(`stays under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    // Measured at 0.7 ms on a 100-row page, so this fires on a catastrophe and
    // nothing smaller. Asserted at the documented figure all the same: a runner
    // a hundred times slower is still inside it.
    const p95 = await measured("posts");
    expect(
      p95,
      `p95 is ${p95.toFixed(1)} ms over ${String(ITERATIONS)} HTTP round trips on a ` +
        `${String(MAX_PER_PAGE)}-row page, against a ${String(BUDGET_MS)} ms budget.`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);
});

describe("a /records round trip on a table that gathers and totals", () => {
  it("did the work, or the measurement below is of a page that skipped it", async () => {
    // First, because every number after this is worthless without it. A panel
    // that answered neither would be the fastest thing in this file.
    const answer = await roundTrip("gathered");

    expect(answer.summaries?.["owed"]).toHaveLength(2);
    expect(answer.groups?.length).toBe(TEAMS.length);
    expect(answer.groups?.some((one) => one.key === null)).toBe(true);
  });

  it(`stays under the same ${String(BUDGET_MS)} ms p95 budget`, async () => {
    const p95 = await measured("gathered");
    expect(
      p95,
      `p95 is ${p95.toFixed(1)} ms over ${String(ITERATIONS)} HTTP round trips on a ` +
        `${String(MAX_PER_PAGE)}-row page with a footer and a grouping, against a ` +
        `${String(BUDGET_MS)} ms budget.`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
