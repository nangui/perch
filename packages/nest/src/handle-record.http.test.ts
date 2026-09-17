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
import { Schema, Table, TextColumn, TextInput, TextInputColumn } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const ROWS: Row[] = [{ id: 1, title: "Ada's post" }];

/** What the panel reached for, so a test can say it did not. */
const touched: string[] = [];
/** What a hook was handed, so a test can say what the panel offered it. */
const offered: { create?: WriteTree; update?: [Row, WriteTree] } = {};

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [this.meta()] };
  }
  meta(): ModelMeta {
    return model({ fields: [key(), scalar("title"), scalar("draftNote")] });
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: ROWS, total: ROWS.length });
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
  Table.make().columns([TextColumn.make("title"), TextInputColumn.make("title")]);

/** Writes its own rows, and says what it was given. */
@PanelResource({ model: "Post", slug: "handled" })
class HandledResource {
  form(): Schema {
    return form();
  }
  table(): Table {
    return table();
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
  touched.length = 0;
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
        resources: [HandledResource, KeylessResource, PlainResource],
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
