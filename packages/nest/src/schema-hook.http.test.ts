/**
 * A module extending a form it does not own: milestone A4.
 *
 * The field has to be there on every route that reads a form, not only the one
 * that draws it — a field one route knows about and another does not is a
 * field that shows and will not save, which is worse than one that is missing.
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
  Row,
  Schema as SchemaTree,
  WriteTree,
} from "@perchjs/core";
import { Schema, Section, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";
import type { SchemaHook } from "./schema-hook.js";

const META = model({
  fields: [
    key(),
    scalar("title"),
    // The columns the modules below inject a field for. A hook adds a control;
    // it does not add a column, so the model has to already have one.
    scalar("createdBy"),
    scalar("moderatedBy"),
    scalar("one"),
    scalar("two"),
  ],
});

let rows: Row[] = [];
let written: WriteTree[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [META] };
  }
  meta(): ModelMeta {
    return META;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(rows.find((row) => row["id"] === id) ?? null);
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    written = [...written, data];
    return Promise.resolve({ id: 2, ...data.set });
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    written = [...written, data];
    return Promise.resolve({ id, ...data.set });
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
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

/** A resource that has never heard of the module below. */
@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
}

/**
 * The third party: an audit module adding a field to everything it recognises,
 * with no list of the resources it is meant to touch.
 */
const audit: SchemaHook = (resource, schema) =>
  resource.model === "Post"
    ? Schema.make([
        ...schema.children,
        Section.make("Audit").schema([TextInput.make("createdBy")]),
      ])
    : schema;

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-extend-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication;
let url: string;

async function serve(extend: readonly SchemaHook[] = [audit]): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
        extend,
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
}

beforeEach(() => {
  rows = [{ id: 1, title: "Post", createdBy: "" }];
  written = [];
});

afterEach(async () => {
  await app.close();
});

describe("how often a module is asked", () => {
  it("is asked once by a save, which reads a form in two places", async () => {
    let calls = 0;
    await serve([
      (_resource, schema) => {
        calls += 1;
        return schema;
      },
    ]);
    calls = 0;

    await fetch(`${url}/admin/api/posts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "Post" } }),
    });

    // Somebody else's code on the hot path. Whatever the count is, it is
    // written down here rather than discovered by a module that is slow.
    // One evaluation decides what may be written and which files go with it.
    expect(calls).toBe(1);
  });
});

describe("a field a module injected", () => {
  it("is on the page the resource draws", async () => {
    await serve();

    const page = await (await fetch(`${url}/admin/posts/1/edit`)).text();
    expect(page).toContain("createdBy");
  });

  it("comes back from a round trip, because the cycle sees it too", async () => {
    await serve();

    const answer = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: { title: "Post", createdBy: "ada" },
        dirtyPath: "createdBy",
        operation: "edit",
        id: 1,
      }),
    });

    expect(await answer.text()).toContain("createdBy");
  });

  it("is written, which is the half a form that only draws it would miss", async () => {
    await serve();

    await fetch(`${url}/admin/api/posts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "Post", createdBy: "ada" } }),
    });

    expect(written[0]?.set).toEqual({ title: "Post", createdBy: "ada" });
  });

  it("is absent everywhere when no module asked for it", async () => {
    await serve([]);

    const page = await (await fetch(`${url}/admin/posts/1/edit`)).text();
    expect(page).not.toContain("createdBy");

    await fetch(`${url}/admin/api/posts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "Post", createdBy: "smuggled" } }),
    });
    // Refused by the rule that refuses every path nobody declared. Nothing
    // about hooks was added to say so.
    expect(written[0]?.set).toEqual({ title: "Post" });
  });

  it("leaves a resource the hook does not recognise alone", async () => {
    const other: SchemaHook = (resource, schema) =>
      resource.model === "Comment"
        ? Schema.make([...schema.children, TextInput.make("moderatedBy")])
        : schema;
    await serve([other]);

    const page = await (await fetch(`${url}/admin/posts/1/edit`)).text();
    expect(page).not.toContain("moderatedBy");
  });

  it("applies every module, in the order they were given", async () => {
    const first: SchemaHook = (_r, schema) =>
      Schema.make([...schema.children, TextInput.make("one")]);
    const second: SchemaHook = (_r, schema) =>
      Schema.make([...schema.children, TextInput.make("two")]);
    await serve([first, second]);

    const page = await (await fetch(`${url}/admin/posts/1/edit`)).text();
    const at = (name: string): number =>
      page.indexOf(`"path":"${name}"`.replace(/"/g, "&quot;"));
    expect(at("one")).toBeGreaterThan(-1);
    expect(at("two")).toBeGreaterThan(at("one"));
  });
});
