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
  Query,
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
  Select,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { MAX_SELECTION } from "./action-selection.js";
import { PanelResource } from "./resource.js";

let ran: { record: Row; data: Readonly<Record<string, unknown>> }[] = [];
let deleted: readonly Id[][] = [];
let policy: Authorization | undefined;
let guard: ((user: unknown, record: Row) => boolean) | undefined;
let transactions = 0;
let queries = 0;
let explode = false;
let withForm = false;

const ROWS: Record<number, Row> = Object.fromEntries(
  Array.from({ length: 600 }, (_, i) => [
    i + 1,
    { id: i + 1, title: `Row ${String(i + 1)}` },
  ]),
);

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
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    // Honours the one clause the action route builds. A double that ignored it
    // would answer every selection with every row.
    const clause = query.clauses?.[0];
    const wanted = Array.isArray(clause?.value) ? clause.value : [];
    queries += 1;
    const rows = wanted
      .map((id) => ROWS[Number(id)])
      .filter((row): row is Row => row !== undefined);
    return Promise.resolve({ rows, total: rows.length });
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
        if (explode) throw new Error("connection string is postgres://u:p@host");
        ran = [...ran, { record, data }];
        return Notification.make().title("Archived").success();
      });
    if (guard !== undefined) archive = archive.authorize(guard);
    if (withForm) {
      archive = archive.form(
        Tree.make([
          TextInput.make("reason").required(),
          Select.make("severity")
            .options({ low: "Low", high: "High" })
            // `Boolean`, not `!== ""`: an unfilled path reads as `undefined`,
            // which is not the empty string and would have been visible.
            .visible(({ get }) => Boolean(get("reason"))),
        ]),
      );
    }

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
  queries = 0;
  explode = false;
  withForm = false;
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
    expect((await press("ArchiveAction", { id: 9999 })).status).toBe(404);
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

  it("says the same nothing whichever refusal it was", async () => {
    // Measured rather than recalled, because the client decides from this what
    // to put in front of a reader: a body with no useful sentence in it.
    policy = { update: () => false };

    expect((await press("ArchiveAction")).body).toEqual({
      statusCode: 404,
      message: "Not Found",
    });
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

describe("a selection of many", () => {
  it("runs the same callback once per ticked record, and counts them", async () => {
    const answer = await press("ArchiveAction", { ids: [1, 2, 3] });

    expect(answer.body["processed"]).toBe(3);
    expect(ran.map((call) => call.record["id"])).toEqual([1, 2, 3]);
  });

  it("loads them in one query rather than one per row", async () => {
    await press("ArchiveAction", { ids: [1, 2, 3, 4, 5] });

    expect(queries).toBe(1);
  });

  it("runs the whole batch inside one transaction", async () => {
    await press("ArchiveAction", { ids: [1, 2, 3] });

    expect(transactions).toBe(1);
  });

  it("takes five hundred rows, which is what the criterion asks for", async () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);

    const answer = await press("ArchiveAction", { ids });

    expect(answer.body).toMatchObject({ processed: 500, refused: 0 });
    expect(transactions).toBe(1);
    expect(queries).toBe(1);
  });

  it("refuses a selection past the ceiling rather than trimming it", async () => {
    // Trimmed, a reader who ticked too many would get a cheerful count for part
    // of it and no way to learn which part.
    const ids = Array.from({ length: MAX_SELECTION + 1 }, (_, i) => i + 1);

    const answer = await press("ArchiveAction", { ids });

    expect(answer.status).toBe(422);
    expect(ran).toEqual([]);
  });

  it("counts one row once, however many times it was named", async () => {
    const answer = await press("ArchiveAction", { ids: [1, 1, 2, 1] });

    expect(answer.body["processed"]).toBe(2);
  });

  it("acts on what is still there, and says how many that was", async () => {
    // A row deleted between the tick and the press. The honest answer is the
    // count of what was actually found.
    const answer = await press("ArchiveAction", { ids: [1, 9999, 2] });

    expect(answer.body["processed"]).toBe(2);
  });

  it("keeps going past a row the guard turns down, and reports both", async () => {
    guard = (_user, record) => record["id"] !== 2;

    const answer = await press("ArchiveAction", { ids: [1, 2, 3] });

    expect(answer.body).toMatchObject({ processed: 2, refused: 1 });
  });

  it("keeps going past a row the resource policy turns down", async () => {
    policy = { update: (_user, record) => (record as Row)["id"] !== 2 };

    const answer = await press("ArchiveAction", { ids: [1, 2, 3] });

    expect(answer.body).toMatchObject({ processed: 2, refused: 1 });
    expect(ran.map((call) => call.record["id"])).toEqual([1, 3]);
  });

  it("asks a record-blind policy once, not once per row", async () => {
    let asked = 0;
    policy = {
      delete: () => {
        asked += 1;
        return true;
      },
    };

    await press("DeleteAction", { ids: [1, 2, 3, 4, 5] });

    expect(asked).toBe(1);
  });

  it("is a 404 when the principal may touch none of them", async () => {
    policy = { update: () => false };

    expect((await press("ArchiveAction", { ids: [1, 2, 3] })).status).toBe(404);
    expect(ran).toEqual([]);
  });

  it("is a 404 when none of the ticked rows still exist", async () => {
    expect((await press("ArchiveAction", { ids: [9998, 9999] })).status).toBe(404);
  });
});

describe("deleting many", () => {
  it("goes through the adapter once, with every key it may touch", async () => {
    const answer = await press("DeleteAction", { ids: [1, 2, 3] });

    expect(answer.body).toMatchObject({ processed: 3, refused: 0 });
    expect(deleted).toEqual([[1, 2, 3]]);
  });

  it("deletes only the rows the guard admits, in that one statement", async () => {
    guard = (_user, record) => record["id"] !== 2;

    const answer = await press("DeleteAction", { ids: [1, 2, 3] });

    expect(deleted).toEqual([[1, 3]]);
    expect(answer.body).toMatchObject({ processed: 2, refused: 1 });
  });

  it("touches nothing at all when the guard admits none", async () => {
    guard = () => false;

    expect((await press("DeleteAction", { ids: [1, 2] })).body).toMatchObject({
      processed: 0,
      refused: 2,
    });
    expect(deleted).toEqual([]);
  });
});

describe("an action that throws", () => {
  it("says nothing about what went wrong inside it", async () => {
    // Never a stack trace and never the message: an author's error text is
    // written for a log, and it says things like where the database lives.
    explode = true;

    const answer = await press("ArchiveAction", { ids: [1, 2] });

    expect(answer.status).toBe(500);
    expect(JSON.stringify(answer.body)).not.toContain("postgres://");
    expect(JSON.stringify(answer.body)).not.toContain("connection string");
  });

  it("takes the whole batch down with it rather than half of it", async () => {
    // One transaction. What rolled back must not depend on which row threw.
    explode = true;

    await press("DeleteAction", { ids: [1, 2, 3] });
    expect(deleted).toEqual([[1, 2, 3]]);

    deleted = [];
    await press("ArchiveAction", { ids: [1, 2, 3] });
    expect(ran).toEqual([]);
  });
});

describe("an action that collects something first", () => {
  const ask = async (body: unknown) => {
    const response = await fetch(`${url}/admin/api/posts/actions/ArchiveAction/form`, {
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

  it("hands back a resolved schema rather than the declaration", async () => {
    withForm = true;

    const answer = await ask({ ids: [1] });

    expect(answer.status).toBe(200);
    expect(JSON.stringify(answer.body)).toContain('"path":"reason"');
  });

  it("resolves it, so a field that depends on another is already right", async () => {
    withForm = true;

    const empty = await ask({ ids: [1] });
    const filled = await ask({ ids: [1], data: { reason: "stale" } });

    // `severity` is invisible until `reason` has something in it, and an
    // invisible field is not sent at all.
    expect(JSON.stringify(empty.body)).not.toContain("severity");
    expect(JSON.stringify(filled.body)).toContain("severity");
  });

  it("is a 404 for an action that collects nothing", async () => {
    expect((await ask({ ids: [1] })).status).toBe(404);
  });

  it("goes through the same refusals the run does", async () => {
    withForm = true;
    policy = { update: () => false };

    expect((await ask({ ids: [1] })).status).toBe(404);
  });
});

describe("what a modal sent", () => {
  it("reaches the callback once it has been through the boundary", async () => {
    withForm = true;

    await press("ArchiveAction", { ids: [1], data: { reason: "stale" } });

    expect(ran[0]?.data).toEqual({ reason: "stale" });
  });

  it("loses whatever the schema never declared", async () => {
    withForm = true;

    await press("ArchiveAction", {
      ids: [1],
      data: { reason: "stale", isAdmin: true },
    });

    expect(ran[0]?.data).toEqual({ reason: "stale" });
  });

  it("loses a field the schema says is not there", async () => {
    // `severity` is invisible while `reason` is empty, and an invisible field
    // is never admitted — the same rule a page form is held to.
    withForm = true;

    await press("ArchiveAction", { ids: [1], data: { reason: "", severity: "high" } });

    expect(ran).toEqual([]);
  });

  it("refuses a form that does not validate, rather than half-doing it", async () => {
    withForm = true;

    const answer = await press("ArchiveAction", { ids: [1], data: {} });

    expect(answer.status).toBe(422);
    expect(ran).toEqual([]);
  });

  it("is the same for fifty rows as for one, because it is filled once", async () => {
    withForm = true;

    await press("ArchiveAction", { ids: [1, 2, 3], data: { reason: "stale" } });

    expect(ran.map((call) => call.data)).toEqual([
      { reason: "stale" },
      { reason: "stale" },
      { reason: "stale" },
    ]);
  });
});

describe("a modal's own reactivity", () => {
  const state = async (body: unknown) => {
    const response = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, text };
  };

  it("resolves the action's schema when the request names one", async () => {
    // Criterion 3: the state protocol works inside a modal. It is the same
    // cycle, pointed at a different schema.
    withForm = true;

    const answer = await state({
      state: { reason: "stale" },
      dirtyPath: "reason",
      operation: "create",
      action: "ArchiveAction",
    });

    expect(answer.status).toBe(200);
    expect(answer.text).toContain("severity");
    expect(answer.text).not.toContain('"path":"title"');
  });

  it("resolves the resource's own form when it names none", async () => {
    withForm = true;

    const answer = await state({
      state: { title: "Hello" },
      dirtyPath: "title",
      operation: "create",
    });

    expect(answer.text).toContain('"path":"title"');
    expect(answer.text).not.toContain("severity");
  });

  it("holds the schema behind the same refusals the form route does", async () => {
    // Two doors to one modal. The form route goes through every refusal; if
    // this one does not, the guarded door is decoration.
    withForm = true;
    policy = { update: () => false };

    const answer = await state({
      state: {},
      dirtyPath: "reason",
      operation: "create",
      action: "ArchiveAction",
    });

    expect(answer.status).toBe(404);
  });

  it("refuses a name the table never declared", async () => {
    const answer = await state({
      state: {},
      dirtyPath: "reason",
      operation: "create",
      action: "DropDatabaseAction",
    });

    expect(answer.status).toBe(404);
  });

  it("refuses an action that collects nothing", async () => {
    // `withForm` is false, so `ArchiveAction` has no schema to resolve.
    const answer = await state({
      state: {},
      dirtyPath: "reason",
      operation: "create",
      action: "ArchiveAction",
    });

    expect(answer.status).toBe(404);
  });
});
