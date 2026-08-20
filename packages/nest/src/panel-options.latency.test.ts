/**
 * What a relationship select is accepted on, over HTTP.
 *
 * `Select.relationship()` on a table of 50,000 rows: opening under 200 ms,
 * searching under 200 ms, and no N+1 query.
 *
 * What this bounds is our cost, not the database's. The adapter here holds the
 * rows in memory, so the numbers say that the framework — routing, resolution,
 * admission, serialisation — does not spend the budget before the query has
 * even run. Keeping the query itself inside it is the adapter's to do, and a
 * relation of this size wants an index on the label field.
 *
 * Measured at 1.7 ms to open and 9.4 ms to search, and most of the second
 * figure is this adapter filtering fifty thousand rows in JavaScript — work a
 * database does in an index. Both are asserted at the documented budget anyway:
 * that is the number the project stops on.
 *
 * The N+1 assertion is the one that would still hold on any database: one
 * query to open the field, one to answer a search, however large the relation
 * and however many other fields the form carries.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Query, Row } from "@perchjs/core";
import { Schema, Select, TextInput } from "@perchjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OptionsAnswer } from "./panel-options.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const BUDGET_MS = 200;
const ITERATIONS = 100;
const WARMUP = 20;
const AUTHORS = 50_000;

/** Sorted by name already, which is the order the loader asks for. */
const ROWS: readonly Row[] = Array.from({ length: AUTHORS }, (_, i) => ({
  id: i + 1,
  name: `Author ${String(i).padStart(6, "0")}`,
}));

const IR = {
  models: [
    {
      name: "Post",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "title", type: "String" },
        { name: "authorId", type: "Int" },
        { name: "editorId", type: "Int" },
      ],
      relations: [
        {
          name: "author",
          type: "many-to-one",
          targetModel: "Author",
          foreignKeyFields: ["authorId"],
          referencedFields: ["id"],
          isList: false,
        },
      ],
      primaryKey: "id",
      hasSoftDelete: false,
    },
    {
      name: "Author",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "name", type: "String" },
      ],
      relations: [],
      primaryKey: "id",
      hasSoftDelete: false,
    },
  ],
} as unknown as Ir;

let queries: Query[] = [];

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return IR;
  }
  meta(): ModelMeta {
    return {
      name: "Post",
      primaryKey: { name: "id", type: "Int" },
    } as unknown as ModelMeta;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    queries.push(query);
    const term = query.search?.term;
    const clause = query.clauses?.[0];

    let rows: readonly Row[] = ROWS;
    if (clause !== undefined) rows = ROWS.filter((row) => row["id"] === clause.value);
    else if (term !== undefined)
      rows = ROWS.filter((row) => String(row["name"]).includes(term));

    return Promise.resolve({ rows: rows.slice(0, query.take), total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(id === 1 ? { id: 1, authorId: 40_000 } : null);
  }
  create(): Promise<Row> {
    return Promise.resolve({ id: 1 });
  }
  update(): Promise<Row> {
    return Promise.resolve({ id: 1 });
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  /** Not exercised here: a double that answered zero would let a test
   * pass with nothing having happened. */
  forceDelete(): Promise<number> {
    throw new Error("not needed here");
  }
  restore(): Promise<number> {
    throw new Error("not needed here");
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title"),
      Select.make("authorId").relationship("author", "name").searchable(),
      // A second relationship field, so "one query" cannot pass by there being
      // only one thing that could have asked.
      Select.make("editorId").relationship("author", "name"),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-optlat-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  queries = [];
});

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
  );
}

/** Opening the field is rendering the page it sits on. */
async function opening(): Promise<string> {
  const response = await fetch(`${url}/admin/posts/1/edit`);
  if (!response.ok) throw new Error(`the page answered ${String(response.status)}`);
  return await response.text();
}

async function searching(term: string): Promise<OptionsAnswer> {
  const response = await fetch(`${url}/admin/api/posts/options`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: {}, operation: "create", path: "authorId", term }),
  });
  if (!response.ok) throw new Error(`/options answered ${String(response.status)}`);
  return (await response.json()) as OptionsAnswer;
}

async function budget(run: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < WARMUP; i += 1) await run();

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return percentile(samples, 95);
}

describe(`a relation of ${String(AUTHORS)} rows`, () => {
  it(`opens under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    // Timed only once it is known to be loading something. A page that renders
    // the field with no options renders it very fast.
    expect(await opening()).toContain("Author 0");

    const p95 = await budget(opening);

    expect(
      p95,
      `opening is ${p95.toFixed(1)} ms at p95 over ${String(ITERATIONS)} renders, ` +
        `against a ${String(BUDGET_MS)} ms budget`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it(`searches under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    // Timed only once it is known to be answering. A refused search returns an
    // empty list very fast, and a budget met that way is met by doing nothing.
    const answered = await searching("Author 04");
    expect(answered.options.length).toBeGreaterThan(0);

    const p95 = await budget(async () => await searching("Author 04"));

    expect(
      p95,
      `searching is ${p95.toFixed(1)} ms at p95 over ${String(ITERATIONS)} requests, ` +
        `against a ${String(BUDGET_MS)} ms budget`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);
});

describe("what it costs in queries", () => {
  it("opens two fields on one relation with one window between them", async () => {
    await opening();

    // Both selects name the same relation and the same label, so they are the
    // same question and it is asked once. The second query is the row being
    // edited, which sorts past the window and is fetched on its own.
    const asked = queries.filter((query) => query.model === "Author");
    expect(asked).toHaveLength(2);
    expect(asked.filter((query) => query.clauses !== undefined)).toHaveLength(1);
  });

  it("asks once to answer a search, whatever else the form carries", async () => {
    await searching("Author 04");

    expect(queries).toHaveLength(1);
  });

  it("does not grow with the size of the relation", async () => {
    // The same count against a term that matches ten thousand rows as against
    // one that matches a handful: a query per field, never a query per row.
    await searching("Author 0");
    const wide = queries.length;

    queries = [];
    await searching("Author 049999");
    const narrow = queries.length;

    // The count, not merely the sameness: two refusals are also equal, and
    // nothing here would have noticed.
    expect({ wide, narrow }).toEqual({ wide: 1, narrow: 1 });
  });

  it("never asks for more than the declared cap", async () => {
    await searching("Author 0");

    expect(queries[0]?.take).toBe(50);
  });
});
