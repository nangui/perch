/**
 * The table, over HTTP: milestone A2.
 *
 * What A2 validates is the query layer, so this measures the query layer. That
 * a filter draws, that a bulk button appears, that a modal opens — seven other
 * files hold those, and none of them says what the page costs. Here the four
 * ingredients are one page and the questions are about the reads it makes.
 *
 * The adapter answers from memory, as the two latency files do, so what is
 * measured is the panel's own cost: routing, the guard, building the query from
 * the string, the selection, and JSON out. A slow database is the caller's to
 * fix; a slow panel is ours.
 *
 * The transaction here takes a copy and puts it back. Every other double that
 * writes into a variable and calls that a transaction proves nothing about a
 * rollback, because nothing it does can fail.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Page,
  Query,
  Row,
  Schema as SchemaTree,
  Table as TableTree,
} from "@perchjs/core";
import {
  Action,
  Notification,
  Schema,
  SelectFilter,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const BUDGET_MS = 150;
const ITERATIONS = 100;
const WARMUP = 20;

/** Twenty, so a query per row would be twenty-one and not two. */
const ROWS = 20;

const AUTHOR: ModelMeta = model({
  name: "Author",
  dbName: "Author",
  fields: [key(), scalar("name")],
  labelField: "name",
});

const POST: ModelMeta = model({
  fields: [
    key(),
    scalar("title"),
    scalar("status"),
    scalar("authorId", { type: "Int" }),
  ],
  relations: [
    {
      name: "author",
      type: "one",
      targetModel: "Author",
      relationName: "AuthorToPost",
      foreignKeyFields: ["authorId"],
      referencedFields: ["id"],
      isRequired: true,
      isList: false,
    },
  ],
});

const AUTHORS: Row[] = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
];

/** Half live, half draft, so a filter has something to remove. */
function seed(): Row[] {
  return Array.from({ length: ROWS }, (_, at) => ({
    id: at + 1,
    title: `Post ${String(at + 1)}`,
    status: at % 2 === 0 ? "live" : "draft",
    authorId: (at % 2) + 1,
  }));
}

let store: Row[] = seed();
let queries: Query[] = [];
let transactions = 0;
let ran: Id[] = [];
let failOn: Id | undefined;

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST, AUTHOR] };
  }
  meta(name: string): ModelMeta {
    return name === "Author" ? AUTHOR : POST;
  }

  findMany(query: Query): Promise<Page> {
    queries.push(query);
    // The clauses are applied rather than ignored: a double that hands back
    // every row lets a filter that never reached the query pass here, and the
    // total is what a reader pages through.
    const kept = store.filter((row) =>
      (query.clauses ?? []).every((clause) => {
        const held = row[clause.path];
        // The operators this page can produce, and no fallback: a double that
        // answered `true` to an operator it did not know would let a selection
        // it never narrowed pass for one it did.
        if (clause.operator === "in") {
          return (clause.value as readonly unknown[]).includes(held);
        }
        if (clause.operator === "equals") return held === clause.value;
        throw new Error(`the double has no ${clause.operator}`);
      }),
    );
    const from = query.skip ?? 0;
    const rows = kept.slice(from, from + (query.take ?? kept.length));
    return Promise.resolve({
      rows: rows.map((row) =>
        query.include?.["author"] === undefined
          ? row
          : { ...row, author: AUTHORS.find((one) => one["id"] === row["authorId"]) },
      ),
      total: kept.length,
    });
  }

  findOne(_name: string, id: Id): Promise<Row | null> {
    return Promise.resolve(store.find((row) => row["id"] === id) ?? null);
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

  /** A copy taken, and put back when the body throws. */
  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    transactions += 1;
    const before = store.map((row) => ({ ...row }));
    try {
      return await fn(this);
    } catch (error) {
      store = before;
      throw error;
    }
  }
}

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }

  table(): TableTree {
    return Table.make()
      .columns([
        TextColumn.make("title").label("Title"),
        // Through the relation, which is what puts an `include` in the query.
        TextColumn.make("author.name").label("Author"),
      ])
      .filters([
        SelectFilter.make("status")
          .label("Status")
          .options([
            { value: "live", label: "Live" },
            { value: "draft", label: "Draft" },
          ]),
      ])
      .bulkActions([
        ArchiveAction.make()
          .label("Archive")
          .requiresConfirmation({ heading: "Archive them?", confirmLabel: "Archive" })
          .action((record) => {
            const id = record["id"] as Id;
            ran.push(id);
            // It writes, and that is the point: a rollback with nothing to undo
            // is not evidence of a rollback.
            const at = store.findIndex((one) => one["id"] === id);
            if (at >= 0) store[at] = { ...store[at], status: "archived" };
            if (id === failOn) throw new Error("the third one refused");
            return Notification.make().title("Archived").success();
          }),
        // Declared, drawn, and refused: the button is not the protection.
        ArchiveAction.make()
          .name("Purge")
          .label("Purge")
          .authorize(() => false)
          .action(() => Notification.make().title("Purged").success()),
      ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-a2-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
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
  store = seed();
  queries = [];
  transactions = 0;
  ran = [];
  failOn = undefined;
});

const records = async (search = ""): Promise<Record<string, unknown>> => {
  const response = await fetch(`${url}/admin/api/posts/records${search}`);
  return (await response.json()) as Record<string, unknown>;
};

const press = async (
  name: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${url}/admin/api/posts/actions/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
  };
};

describe("a page of rows with a relation column", () => {
  it("costs one read, whatever the page holds", async () => {
    await records();

    // The criterion the whole query layer is accepted on. A page that asked per
    // row would still look right and would be twenty-one reads.
    expect(queries).toHaveLength(1);
    expect(queries[0]?.include).toEqual({ author: true });
  });

  it("comes back with the relation on every row, so the count is not a count of nothing", async () => {
    const page = await records();
    const rows = page["rows"] as Row[];

    expect(rows).toHaveLength(ROWS);
    expect(
      rows.every((row) => (row["author"] as Row | undefined)?.["name"] !== undefined),
    ).toBe(true);
  });
});

describe("a filter", () => {
  it("reaches the query rather than hiding rows the client was already sent", async () => {
    const page = await records("?filter.status=live");

    // If it were applied on the client the read would be unfiltered and the
    // total would be twenty — and the reader would page through nothing.
    expect(queries[0]?.clauses).toContainEqual({
      path: "status",
      operator: "equals",
      value: "live",
    });
    expect(page["total"]).toBe(ROWS / 2);
  });

  it("still costs one read, and still names the relation", async () => {
    await records("?filter.status=live");

    expect(queries).toHaveLength(1);
    expect(queries[0]?.include).toEqual({ author: true });
  });
});

describe("a bulk action over a selection", () => {
  it("runs once per record, inside one transaction", async () => {
    const answer = await press("ArchiveAction", { ids: [1, 2, 3] });

    expect(answer.status).toBe(200);
    expect(ran).toEqual([1, 2, 3]);
    // One for the selection, not one apiece.
    expect(transactions).toBe(1);
    // And it did something: three rows changed and the rest did not.
    expect(store.filter((row) => row["status"] === "archived")).toHaveLength(3);
  });

  it("leaves nothing half-done when one record refuses", async () => {
    failOn = 3;
    const before = store.map((row) => ({ ...row }));

    await press("ArchiveAction", { ids: [1, 2, 3, 4, 5] });

    // Two had already been written when the third threw. Neither survives.
    expect(ran).toEqual([1, 2, 3]);
    expect(store).toEqual(before);
  });
});

describe("an action the reader may not run", () => {
  it("carries out nothing, and says so, on a request that never saw a page", async () => {
    // Forged: no page drew this button for this reader. A hidden control is not
    // a protection, so the refusal is made here, per record, at the moment of
    // running rather than at the moment of drawing.
    const answer = await press("Purge", { ids: [1, 2] });

    expect(ran).toEqual([]);
    // Not an error: the request was well formed and the reader may ask. The
    // answer counts what it would not do rather than pretending it did it.
    expect(answer.body).toEqual({ processed: 0, refused: 2 });
  });
});

describe("what the page costs", () => {
  it(`answers a filtered page with a relation column under ${String(BUDGET_MS)}ms at p95`, async () => {
    const timings: number[] = [];
    for (let at = 0; at < WARMUP + ITERATIONS; at += 1) {
      const started = performance.now();
      await records("?filter.status=live");
      if (at >= WARMUP) timings.push(performance.now() - started);
    }
    timings.sort((one, two) => one - two);
    const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0;

    expect(p95).toBeLessThan(BUDGET_MS);
  });
});
