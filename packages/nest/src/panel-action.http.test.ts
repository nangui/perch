/**
 * Pressing a button, over HTTP.
 *
 * The route is mostly refusals, so most of this is about what it turns down: a
 * name nobody declared, a row that does not exist, a principal the resource
 * says no to, and a guard that says no to this particular row.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Row,
  Schema,
  Table as TableTree,
} from "@perchjs/core";
import {
  Action,
  DeleteAction,
  EditAction,
  Notification,
  Schema as Tree,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

let ran: { record: Row; data: Readonly<Record<string, unknown>> }[] = [];
let deleted: readonly Id[][] = [];
let policy: Authorization | undefined;
let guard: ((user: unknown, record: Row) => boolean) | undefined;
let transactions = 0;

const ROWS: Record<number, Row> = {
  1: { id: 1, title: "First" },
  2: { id: 2, title: "Second" },
};

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

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [] };
  }
  meta(): ModelMeta {
    return {
      name: "Post",
      primaryKey: { name: "id", type: "Int" },
    } as unknown as ModelMeta;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: [], total: 0 });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS[Number(id)] ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(): Promise<Row> {
    throw new Error("not needed here");
  }
  delete(_model: string, ids: readonly Id[]): Promise<number> {
    deleted = [...deleted, [...ids]];
    return Promise.resolve(ids.length);
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    transactions += 1;
    return fn(this);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  // An empty policy is one that checks nothing, which is the default the
  // interface documents. A getter, so each test's `policy` is read per request.
  get can(): Authorization {
    return policy ?? {};
  }

  form(): Schema {
    return Tree.make([TextInput.make("title")]);
  }

  table(): TableTree {
    let archive = ArchiveAction.make()
      .label("Archive")
      .action((record, data) => {
        ran = [...ran, { record, data }];
        return Notification.make().title("Archived").success();
      });
    if (guard !== undefined) archive = archive.authorize(guard);

    let remove = DeleteAction.make();
    if (guard !== undefined) remove = remove.authorize(guard);

    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([EditAction.make(), archive, remove]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-action-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication;
let url: string;

beforeEach(async () => {
  ran = [];
  deleted = [];
  transactions = 0;
  policy = undefined;
  guard = undefined;

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

afterEach(async () => {
  await app.close();
});

const press = async (
  name: string,
  body: unknown = { id: 1 },
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

describe("an action a table declared", () => {
  it("runs against the record it names, and says what it did", async () => {
    const answer = await press("ArchiveAction");

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      processed: 1,
      refused: 0,
      notification: { title: "Archived", tone: "success" },
    });
    expect(ran).toEqual([{ record: ROWS[1], data: {} }]);
  });

  it("runs inside a transaction, whatever it turns out to be", async () => {
    await press("ArchiveAction");

    expect(transactions).toBe(1);
  });

  it("forwards nothing a client typed, because nothing has replayed it", async () => {
    // A modal's fields would be replayed against its schema the way form state
    // is. There is no modal and so no schema, so an author who reads `data`
    // finds it empty rather than finds it trusted.
    await press("ArchiveAction", { id: 1, data: { reason: "stale" } });

    expect(ran[0]?.data).toEqual({});
  });

  it("hands it an object rather than undefined, whatever arrived", async () => {
    // A callback reading `data.reason` should find nothing rather than throw
    // on a property of undefined.
    await press("ArchiveAction", { id: 1, data: "not an object" });

    expect(ran[0]?.data).toEqual({});
  });
});

describe("what it refuses", () => {
  it("an action that navigates, which this route cannot carry out", async () => {
    // `EditAction` is a link. Answering 200 with nothing done would tell the
    // caller it worked.
    const answer = await press("EditAction");

    expect(answer.status).toBe(404);
  });

  it("a name the table never declared", async () => {
    expect((await press("DropDatabaseAction")).status).toBe(404);
    expect(ran).toEqual([]);
  });

  it("a record that does not exist", async () => {
    expect((await press("ArchiveAction", { id: 99 })).status).toBe(404);
    expect(ran).toEqual([]);
  });

  it("a request naming no record at all", async () => {
    expect((await press("ArchiveAction", {})).status).toBe(404);
  });

  it("an id of a shape the key cannot be", async () => {
    // `Number({})` is NaN, and `Number("")` is 0 — which would look up row zero.
    expect((await press("ArchiveAction", { id: {} })).status).toBe(404);
    expect((await press("ArchiveAction", { id: "" })).status).toBe(404);
  });

  it("a resource the principal may not change, without mutating anything", async () => {
    policy = { update: () => false };

    expect((await press("ArchiveAction")).status).toBe(404);
    expect(ran).toEqual([]);
  });

  it("a delete the principal may not make", async () => {
    // The delete policy, which nothing consulted before this route existed.
    policy = { delete: () => false };

    expect((await press("DeleteAction")).status).toBe(404);
    expect(deleted).toEqual([]);
  });

  it("says 404 rather than 403, so a caller cannot map what exists", async () => {
    policy = { update: () => false };

    expect((await press("ArchiveAction")).status).toBe(404);
    expect((await press("NoSuchAction")).status).toBe(404);
  });
});

describe("the action's own guard", () => {
  it("is asked at execution time, not only when the button was drawn", async () => {
    guard = () => false;

    const answer = await press("ArchiveAction");

    expect(answer.body).toEqual({ processed: 0, refused: 1 });
    expect(ran).toEqual([]);
  });

  it("is asked about the record, so it can admit one row and not another", async () => {
    guard = (_user, record) => record["id"] === 2;

    expect((await press("ArchiveAction", { id: 1 })).body["processed"]).toBe(0);
    expect((await press("ArchiveAction", { id: 2 })).body["processed"]).toBe(1);
  });

  it("stops a delete it turns down, before the row is touched", async () => {
    guard = () => false;

    expect((await press("DeleteAction")).body).toEqual({ processed: 0, refused: 1 });
    expect(deleted).toEqual([]);
  });
});

describe("deleting", () => {
  it("goes through the adapter once, with the key the row was found by", async () => {
    const answer = await press("DeleteAction");

    expect(answer.body).toEqual({ processed: 1, refused: 0 });
    expect(deleted).toEqual([[1]]);
  });

  it("runs no author callback, because it has none", async () => {
    await press("DeleteAction");

    expect(ran).toEqual([]);
  });
});
