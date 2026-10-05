/**
 * What a list says under all of it.
 *
 * A footer is the same question the page asked, over the same rows, answered
 * once. Three things make it that rather than something that looks like it:
 * every column's footer is one call, the narrowing reaches it and the paging
 * does not, and a column this reader may not have is not asked about at all.
 *
 * The last is the one with teeth. A total of a salary column is a salary
 * answer: four readings of it would narrow one salary down, and a heading
 * nobody drew is no protection if the number under it is still sent.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AggregateQuery,
  AggregateResult,
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  Summary,
} from "@perchjs/core";
import { Schema, Table, TextColumn, TextFilter, TextInput } from "@perchjs/core";
import { RelationManager } from "./relation-manager.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const ROWS: Row[] = [
  { id: 1, name: "Ada", salary: 90000, owed: 1200 },
  { id: 2, name: "Grace", salary: 70000, owed: 800 },
];

const isAdmin = (user: unknown): boolean =>
  (user as { role?: string } | undefined)?.role === "admin";

/** Every aggregate the panel asked for, which is what the counting is about. */
let asked: AggregateQuery[] = [];
/** What the adapter answers, so a null can be put in on purpose. */
let answers: AggregateResult = {};

beforeEach(() => {
  asked = [];
  answers = {
    "owed:sum": 2000,
    "owed:avg": 1000,
    "salary:sum": 160000,
    "id:min": 1,
    "id:max": 2,
    "name:count": 2,
  };
});

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [this.meta("Person"), this.meta("Note")] };
  }
  meta(name = "Person"): ModelMeta {
    return name === "Note"
      ? model({
          name: "Note",
          fields: [key(), scalar("body"), scalar("personId", { type: "Int" })],
          relations: [
            {
              name: "person",
              type: "one",
              targetModel: "Person",
              relationName: "PersonToNote",
              foreignKeyFields: ["personId"],
              referencedFields: ["id"],
              isRequired: true,
              isList: false,
            },
          ],
        })
      : model({
          name: "Person",
          fields: [
            key(),
            scalar("name"),
            scalar("salary", { type: "Int" }),
            scalar("owed", { type: "Int" }),
          ],
          relations: [
            {
              name: "notes",
              type: "many",
              targetModel: "Note",
              relationName: "PersonToNote",
              foreignKeyFields: [],
              referencedFields: ["id"],
              isRequired: false,
              isList: true,
            },
          ],
        });
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: ROWS, total: ROWS.length });
  }
  aggregate(query: AggregateQuery): Promise<AggregateResult> {
    asked.push(query);
    return Promise.resolve(answers);
  }

  // Required by the port; nothing here asks a double to group.
  groupBy(): never {
    throw new Error("not needed here");
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
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    request.user = { role: request.headers["x-role"] ?? "visitor" };
    return true;
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PeopleResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("name").summarise("count"),
        TextColumn.make("owed").summarise("sum", "avg"),
        // A footer on a column this reader may not have. The whole point.
        TextColumn.make("salary").visible(isAdmin).summarise("sum"),
        TextColumn.make("id").summarise("range"),
      ])
      .filters([TextFilter.make("name")]);
  }
}

@PanelResource({ model: "Person", slug: "plain" })
class PlainResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
  table(): Table {
    return Table.make().columns([TextColumn.make("name")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-summary-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PeopleResource, PlainResource],
        dataAdapter: MemoryAdapter,
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

interface Records {
  readonly total: number;
  readonly summaries?: Readonly<Record<string, readonly Summary[]>>;
}

const records = async (
  url: string,
  role: string,
  slug = "people",
  search = "",
): Promise<Records> =>
  (await (
    await fetch(`${url}/admin/api/${slug}/records${search}`, {
      headers: { "x-role": role },
    })
  ).json()) as Records;

describe("the footer a list comes back with", () => {
  it("answers per column, in the order the column declared", async () => {
    const answer = await records(await serve(), "admin");

    expect(answer.summaries?.["owed"]).toEqual([
      { of: "sum", value: 2000 },
      { of: "avg", value: 1000 },
    ]);
    expect(answer.summaries?.["name"]).toEqual([{ of: "count", value: 2 }]);
    expect(answer.summaries?.["id"]).toEqual([{ of: "range", value: 1, to: 2 }]);
  });

  it("costs one read however many columns asked", async () => {
    // The reason the port takes several named aggregations. Four footers over
    // one set of rows are a query, and a footer per column would be the
    // heading equivalent of N+1 under the table instead of in it.
    await records(await serve(), "admin");

    expect(asked).toHaveLength(1);
    expect(Object.keys(asked[0]?.aggregations ?? {})).toHaveLength(6);
  });

  it("is asked nothing where no column asked for anything", async () => {
    const answer = await records(await serve(), "admin", "plain");

    expect(answer.summaries).toBeUndefined();
    expect(asked).toHaveLength(0);
  });

  it("carries a null through rather than showing a reader a zero", async () => {
    answers = { "owed:sum": null, "owed:avg": null };
    const answer = await records(await serve(), "admin");

    expect(answer.summaries?.["owed"]).toEqual([
      { of: "sum", value: null },
      { of: "avg", value: null },
    ]);
  });

  it("is in the page's first paint, not only in a later fetch", async () => {
    // The list page embeds its first page through the same function the API
    // route uses. Without that, a footer appears a moment after the rows and
    // the table moves under whoever is reading it.
    const url = await serve();
    const html = await (
      await fetch(`${url}/admin/people`, {
        headers: { "x-role": "admin" },
      })
    ).text();
    const raw = /data-payload="([^"]*)"/.exec(html)?.[1] ?? "";
    const payload = JSON.parse(
      raw
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
    ) as Records;

    expect(payload.summaries?.["owed"]).toEqual([
      { of: "sum", value: 2000 },
      { of: "avg", value: 1000 },
    ]);
  });
});

describe("which rows a footer is about", () => {
  it("is narrowed by what narrowed the page", async () => {
    // A total over rows the table above it did not list reads exactly like a
    // total, which is what makes it worth a test rather than a comment.
    await records(await serve(), "admin", "people", "?filter.name=Ada");

    expect(asked[0]?.clauses).toContainEqual({
      path: "name",
      operator: "contains",
      value: "Ada",
    });
  });

  it("is not narrowed by the page, which would make it move when one turns", async () => {
    await records(await serve(), "admin", "people", "?page=2&perPage=1&sort=name");
    const one = asked[0] as unknown as Query | undefined;

    expect(one?.take).toBeUndefined();
    expect(one?.skip).toBeUndefined();
    expect(one?.sort).toBeUndefined();
    expect(one?.include).toBeUndefined();
  });
});

describe("a footer on a column this reader may not have", () => {
  it("is never worked out, so the number never exists to leak", async () => {
    // Four readings of a filtered total narrow one salary down. A heading
    // nobody drew is no protection if the number under it still arrives.
    await records(await serve(), "visitor");

    expect(Object.keys(asked[0]?.aggregations ?? {})).not.toContain("salary:sum");
  });

  it("is not in what comes back either", async () => {
    const answer = await records(await serve(), "visitor");

    expect(answer.summaries).not.toHaveProperty("salary");
    expect(answer.summaries).toHaveProperty("owed");
  });

  it("is both for the reader who may have it", async () => {
    const answer = await records(await serve(), "admin");

    expect(Object.keys(asked[0]?.aggregations ?? {})).toContain("salary:sum");
    expect(answer.summaries?.["salary"]).toEqual([{ of: "sum", value: 160000 }]);
  });
});

/** One resource, declared on the spot, so the boot is what is being asked. */
async function boot(
  table: Table,
  managers: readonly RelationManager[] = [],
): Promise<void> {
  @PanelResource({ model: "Person", slug: "booted" })
  class BootResource {
    form(): Schema {
      return Schema.make([TextInput.make("name")]);
    }
    table(): Table {
      return table;
    }
    relations(): readonly RelationManager[] {
      return managers;
    }
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [BootResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
}

describe("a footer the column cannot bear", () => {
  it("stops the boot, naming the column and what it is", async () => {
    // Not at the moment a reader opens the list. A footer that will not draw
    // tells the one person who cannot act on it.
    await expect(
      boot(Table.make().columns([TextColumn.make("name").summarise("sum")])),
    ).rejects.toThrow(/`name` is a String column, and a sum is worked out over/);
  });

  it("stops it for a path that reaches through a relation", async () => {
    await expect(
      boot(Table.make().columns([TextColumn.make("notes.body").summarise("count")])),
    ).rejects.toThrow(/reaches through a relation/);
  });

  it("stops it for a manager's footer too, read against the child's model", async () => {
    // A manager lists through the same function, so it works out a footer the
    // same way. `body` is the child's column and `owed` is not one it has.
    await expect(
      boot(Table.make().columns([TextColumn.make("name")]), [
        RelationManager.make("notes").table((table) =>
          table.columns([TextColumn.make("owed").summarise("sum")]),
        ),
      ]),
    ).rejects.toThrow(/`owed` names no column of Note/);
  });

  it("lets a manager's footer through where the child can bear it", async () => {
    await expect(
      boot(Table.make().columns([TextColumn.make("name")]), [
        RelationManager.make("notes").table((table) =>
          table.columns([TextColumn.make("body").summarise("count")]),
        ),
      ]),
    ).resolves.toBeUndefined();
  });
});
