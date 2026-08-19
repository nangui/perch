/**
 * The p95 budget on `/records`, which could not exist until the route did.
 *
 * The adapter here answers from memory, so what is measured is the panel's own
 * cost: routing, the guard, the user resolver, authorisation, building the query
 * from the string, and JSON out. A slow database is the user's to fix; a slow
 * panel is ours.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Query, Row } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { MAX_PER_PAGE } from "./records-query.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const BUDGET_MS = 150;
const ITERATIONS = 100;
const WARMUP = 20;

/** A full page, because that is the worst a caller may legitimately ask for. */
const ROWS: Row[] = Array.from({ length: MAX_PER_PAGE }, (_, i) => ({
  id: i + 1,
  title: `Row ${String(i)}`,
  body: "x".repeat(120),
}));

const POST: ModelMeta = {
  name: "Post",
  dbName: "Post",
  primaryKey: {
    name: "id",
    kind: "scalar",
    type: "Int",
    isRequired: true,
    isList: false,
    isId: true,
    isUnique: true,
    isReadOnly: true,
    hasDefault: true,
    isLongText: false,
  },
  fields: [],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "title",
};

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

let app: INestApplication | undefined;
let base = "";

beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), "perch-records-p95-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  const assets: PanelAssets = {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
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

async function roundTrip(): Promise<void> {
  const response = await fetch(
    `${base}/admin/api/posts/records?page=1&perPage=${String(MAX_PER_PAGE)}&sort=title:desc&search=Row`,
  );
  if (!response.ok) throw new Error(`/records answered ${String(response.status)}`);
  await response.text();
}

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
  );
}

describe("a /records round trip, end to end", () => {
  it(`stays under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    for (let i = 0; i < WARMUP; i += 1) await roundTrip();

    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const started = performance.now();
      await roundTrip();
      samples.push(performance.now() - started);
    }

    // Measured at 0.7 ms on a 100-row page, so this fires on a catastrophe and
    // nothing smaller. Asserted at the documented figure all the same: a runner
    // a hundred times slower is still inside it.
    const p95 = percentile(samples, 95);
    expect(
      p95,
      `p95 is ${p95.toFixed(1)} ms over ${String(ITERATIONS)} HTTP round trips on a ` +
        `${String(MAX_PER_PAGE)}-row page, against a ${String(BUDGET_MS)} ms budget.`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
