/**
 * An application that writes its own rows.
 *
 * `handleRecordCreation` and `handleRecordUpdate` replace persistence, which
 * is what makes the panel usable where the database is not the model: the
 * write goes through a service or an event bus and the panel never touches a
 * table. Without it the panel is only usable where the database is the model,
 * which is not where most applications with anything to administer are.
 *
 * What is measured here is mostly that the adapter is not reached. A hook that
 * runs and is then written over is worse than no hook, because the row exists
 * twice and only one of them went through the application.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Row, WriteTree } from "@perchjs/core";
import {
  DeleteAction,
  ForceDeleteAction,
  RestoreAction,
  Schema,
  Table,
  TextColumn,
  TextInput,
  TextInputColumn,
} from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const ROWS: Row[] = [
  { id: 1, title: "Ada's post" },
  { id: 2, title: "Grace's post" },
  // The row the database refuses to delete, for the announcement that must
  // not be made when the write does not happen.
  { id: 3, title: "Stubborn" },
];

/** What the panel reached for, so a test can say it did not. */
const touched: string[] = [];
/**
 * Makes the transaction fail after its body has succeeded.
 *
 * A double whose `transaction` only calls its argument cannot tell an
 * announcement made inside the write from one made after it: both are skipped
 * when the statement itself raises. What separates them is a write that
 * succeeds and is then rolled back, which is the case the separation exists
 * for and the only one that measures it.
 */
let failCommit = false;

/** Every announcement, in order, so a test can say when it was made. */
const told: string[] = [];

/** What a hook was handed, so a test can say what the panel offered it. */
const offered: { create?: WriteTree; update?: [Row, WriteTree] } = {};

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return {
      models: [
        this.meta(),
        model({ name: "Refusing", fields: [key(), scalar("title")] }),
      ],
    };
  }
  meta(name = "Post"): ModelMeta {
    return model({ name, fields: [key(), scalar("title"), scalar("draftNote")] });
  }
  /**
   * Narrows on the one clause an action's selection sends.
   *
   * A double that answered with every row whatever it was asked would make a
   * test about one row pass for reasons of its own: the hooks fired twice and
   * the assertion that caught it was the count, not the behaviour.
   */
  findMany(query: {
    clauses?: readonly { path: string; operator: string; value: unknown }[];
  }): Promise<{ rows: readonly Row[]; total: number }> {
    const chosen = (query.clauses ?? []).find(
      (clause) => clause.path === "id" && clause.operator === "in",
    );
    const rows =
      chosen === undefined
        ? ROWS
        : ROWS.filter((row) =>
            (chosen.value as readonly unknown[]).includes(row["id"]),
          );
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    touched.push("create");
    return Promise.resolve({ id: 99, ...data.set });
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    touched.push("update");
    return Promise.resolve({ id, ...data.set });
  }
  delete(_model: string, ids: readonly Id[]): Promise<number> {
    touched.push("delete");
    if (ids.includes(3)) return Promise.reject(new Error("the database said no"));
    return Promise.resolve(ids.length);
  }
  forceDelete(_model: string, ids: readonly Id[]): Promise<number> {
    touched.push("forceDelete");
    return Promise.resolve(ids.length);
  }
  restore(_model: string, ids: readonly Id[]): Promise<number> {
    touched.push("restore");
    return Promise.resolve(ids.length);
  }
  attach(): Promise<void> {
    return Promise.resolve();
  }
  detach(): Promise<void> {
    return Promise.resolve();
  }
  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    const answer = await fn(this);
    if (failCommit) throw new Error("rolled back");
    return answer;
  }
}

const form = (): Schema =>
  Schema.make([
    TextInput.make("title"),
    // Never on the page, so a forged state naming it must not reach a hook
    // either: replacing persistence does not move the boundary.
    TextInput.make("draftNote").visible(() => false),
  ]);

/** What the write holds at a path, as words, or nothing. */
const wrote = (data: WriteTree, path: string): string => {
  const held = data.set?.[path];
  return typeof held === "string" ? held : "";
};
const table = (): Table =>
  Table.make()
    .columns([TextColumn.make("title"), TextInputColumn.make("title")])
    .actions([DeleteAction.make(), ForceDeleteAction.make(), RestoreAction.make()]);

/** Writes its own rows, and says what it was given. */
@PanelResource({ model: "Post", slug: "handled" })
class HandledResource {
  form(): Schema {
    return form();
  }
  table(): Table {
    return table();
  }
  beforeCreate(data: WriteTree): void {
    told.push(`beforeCreate:${wrote(data, "title")}`);
  }
  afterCreate(record: Row): void {
    told.push(`afterCreate:${String(record["id"])}`);
  }
  beforeSave(record: Row, data: WriteTree): void {
    told.push(`beforeSave:${String(record["id"])}:${wrote(data, "title")}`);
  }
  afterSave(record: Row): void {
    told.push(`afterSave:${String(record["id"])}`);
  }
  beforeDelete(record: Row): void {
    told.push(`beforeDelete:${String(record["id"])}`);
  }
  afterDelete(record: Row): void {
    told.push(`afterDelete:${String(record["id"])}`);
  }
  handleRecordCreation(data: WriteTree): Row {
    offered.create = data;
    return { id: 7, title: `service: ${wrote(data, "title")}` };
  }
  handleRecordUpdate(record: Row, data: WriteTree): Row {
    offered.update = [record, data];
    return { ...record, ...data.set, title: `service: ${wrote(data, "title")}` };
  }
}

/** Writes its own rows and forgets to say which one. */
@PanelResource({ model: "Post", slug: "keyless" })
class KeylessResource {
  form(): Schema {
    return form();
  }
  handleRecordCreation(): Row {
    return { title: "written somewhere" };
  }
}

/** Refuses the delete from inside the write. */
@PanelResource({ model: "Refusing", slug: "refusing" })
class RefusingResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  table(): Table {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([DeleteAction.make()]);
  }
  beforeDelete(): void {
    throw new Error("not this one");
  }
}

/** The panel's own writing, unchanged. */
@PanelResource({ model: "Post", slug: "plain" })
class PlainResource {
  form(): Schema {
    return form();
  }
  table(): Table {
    return table();
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-handle-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication | undefined;

beforeEach(() => {
  failCommit = false;
  touched.length = 0;
  told.length = 0;
  delete offered.create;
  delete offered.update;
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [HandledResource, KeylessResource, PlainResource, RefusingResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const post = async (url: string, at: string, body: unknown): Promise<Response> =>
  await fetch(`${url}${at}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const patch = async (url: string, at: string, body: unknown): Promise<Response> =>
  await fetch(`${url}${at}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("a resource that writes its own rows", () => {
  it("is asked instead of the adapter, on a create", async () => {
    const url = await serve();
    const answer = (await (
      await post(url, "/admin/api/handled", { state: { title: "Ada" } })
    ).json()) as { record?: Row };

    expect(touched).toEqual([]);
    expect(answer.record?.["id"]).toBe(7);
  });

  it("is handed the write the form produced", async () => {
    const url = await serve();
    await post(url, "/admin/api/handled", { state: { title: "Ada" } });

    expect(offered.create?.set?.["title"]).toBe("Ada");
  });

  it("is asked instead of the adapter, on a save", async () => {
    const url = await serve();
    await patch(url, "/admin/api/handled/1", { state: { title: "Grace" } });

    expect(touched).toEqual([]);
    expect(offered.update?.[0]["id"]).toBe(1);
    expect(offered.update?.[1].set?.["title"]).toBe("Grace");
  });

  it("is asked for a cell written from the table", async () => {
    // The route that would otherwise slip past: a cell is a save of one field
    // and reaches the adapter by a path of its own. A hook honoured on one
    // route and not the other writes to a database the application said it
    // does not use, on whichever route was forgotten.
    const url = await serve();
    const answer = (await (
      await patch(url, "/admin/api/handled/1/cell", { path: "title", value: "Hopper" })
    ).json()) as { value?: unknown };

    expect(touched).toEqual([]);
    expect(answer.value).toBe("service: Hopper");
  });

  it("still lets the panel write where no hook was declared", async () => {
    const url = await serve();
    await post(url, "/admin/api/plain", { state: { title: "Ada" } });
    await patch(url, "/admin/api/plain/1", { state: { title: "Grace" } });
    await patch(url, "/admin/api/plain/1/cell", { path: "title", value: "Hopper" });

    expect(touched).toEqual(["create", "update", "update"]);
  });
});

describe("a resource told when a row is written", () => {
  it("hears the pair around a create, in order", async () => {
    const url = await serve();
    await post(url, "/admin/api/handled", { state: { title: "Ada" } });

    expect(told).toEqual(["beforeCreate:Ada", "afterCreate:7"]);
  });

  it("hears the pair around a save", async () => {
    const url = await serve();
    await patch(url, "/admin/api/handled/1", { state: { title: "Grace" } });

    expect(told).toEqual(["beforeSave:1:Grace", "afterSave:1"]);
  });

  it("hears a cell written from the table as the save it is", async () => {
    // The route that slips past everything, for the third time in this file.
    const url = await serve();
    await patch(url, "/admin/api/handled/1/cell", { path: "title", value: "Hopper" });

    expect(told).toEqual(["beforeSave:1:Hopper", "afterSave:1"]);
  });

  it("says nothing where a resource declared none", async () => {
    const url = await serve();
    await post(url, "/admin/api/plain", { state: { title: "Ada" } });

    expect(told).toEqual([]);
  });
});

const act = async (
  url: string,
  at: string,
  name: string,
  body: unknown,
): Promise<Response> =>
  await fetch(`${url}${at}/actions/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("a resource told a row was deleted", () => {
  it("hears the pair around each row, and once per row", async () => {
    // A delete is one statement for however many were ticked. The hook is not:
    // it is about a row, so fifty rows is fifty calls, which is a cost worth
    // knowing before a bulk delete is wired to a round trip.
    const url = await serve();
    await act(url, "/admin/api/handled", "DeleteAction", { ids: [1, 2] });

    expect(told).toEqual([
      "beforeDelete:1",
      "beforeDelete:2",
      "afterDelete:1",
      "afterDelete:2",
    ]);
  });

  it("hears a permanent delete as well as a mark", async () => {
    // Otherwise an index kept in step by these hooks goes stale on every
    // force delete, which is the one that really removes the row.
    const url = await serve();
    await act(url, "/admin/api/handled", "ForceDeleteAction", { ids: [1] });

    expect(told).toEqual(["beforeDelete:1", "afterDelete:1"]);
  });

  it("says nothing about a restore, which is not a delete", async () => {
    const url = await serve();
    await act(url, "/admin/api/handled", "RestoreAction", { ids: [1] });

    expect(touched).toEqual(["restore"]);
    expect(told).toEqual([]);
  });

  it("is told about its model's rows, not about its own screen", async () => {
    // The decision this hook turns on. `plain` and `handled` are two resources
    // over one model, which is an ordinary arrangement: one screen for what is
    // live and another for what is archived. A row deleted from either is a row
    // of both, and the one that asked to be told is told.
    const url = await serve();
    await act(url, "/admin/api/plain", "DeleteAction", { ids: [1] });

    expect(told).toEqual(["beforeDelete:1", "afterDelete:1"]);
  });
});

describe("a delete that does not happen", () => {
  it("is not announced", async () => {
    // The worst thing these hooks could do: emit an event, drop a cache or
    // clear an index entry for a row that is still there. The announcement is
    // carried out of the write for exactly this, so a write that raises never
    // reaches it.
    const url = await serve();
    const response = await act(url, "/admin/api/handled", "DeleteAction", { ids: [3] });

    expect(response.status).toBe(500);
    expect(told).toEqual(["beforeDelete:3"]);
    expect(told).not.toContain("afterDelete:3");
  });
});

describe("a delete rolled back after the statement", () => {
  it("is not announced either", async () => {
    // The case the separation exists for, and the one a doubled transaction
    // that only calls its argument cannot show: the statement succeeded, the
    // write did not. An announcement made inside it would have told a resource
    // about a row that is still there.
    failCommit = true;
    const url = await serve();
    const response = await act(url, "/admin/api/handled", "DeleteAction", { ids: [1] });

    expect(response.status).toBe(500);
    expect(touched).toContain("delete");
    expect(told).toEqual(["beforeDelete:1"]);
  });
});

describe("a before hook that refuses", () => {
  it("stops the delete before the statement is issued", async () => {
    // The claim `beforeDelete` makes by running inside the write. Without it
    // the hook is a notification dressed as a veto: the rows go, and the only
    // sign is an error after the fact.
    const url = await serve();
    const response = await act(url, "/admin/api/refusing", "DeleteAction", {
      ids: [1],
    });

    expect(response.status).toBe(500);
    expect(touched).not.toContain("delete");
  });
});

describe("what a hook is handed", () => {
  it("is what the form admitted, not what the client sent", async () => {
    // The hook replaces the write and nothing before it. A field the tree does
    // not make visible is discarded at the boundary, and a hook that received
    // it would be a way past stage 5 rather than a way around the database.
    const url = await serve();
    await post(url, "/admin/api/handled", {
      state: { title: "Ada", draftNote: "forged", unknownPath: "forged" },
    });

    expect(offered.create?.set?.["title"]).toBe("Ada");
    expect(offered.create?.set).not.toHaveProperty("draftNote");
    expect(offered.create?.set).not.toHaveProperty("unknownPath");
  });
});

describe("a hook that does not answer with the row", () => {
  it("is refused, by name", async () => {
    // It does not fail anywhere in particular otherwise: the save answers with
    // an empty record, the browser stays on a form it has already used, and
    // nothing says why.
    const url = await serve();
    const response = await post(url, "/admin/api/keyless", { state: { title: "Ada" } });

    expect(response.status).toBe(500);
  });
});
