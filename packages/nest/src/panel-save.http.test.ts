/**
 * The request that writes. What reaches the adapter is what the engine says may
 * be written, never what arrived.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Row, WriteTree } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { model } from "./__fixtures__/ir.js";
import type { SaveResponse } from "./panel-save.controller.js";

const META = model();

let rows: Row[] = [];
let writes: { kind: string; id?: Id; data: WriteTree }[] = [];

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
    if (!Number.isInteger(id)) throw new TypeError("id must be an Int");
    return Promise.resolve(rows.find((row) => row["id"] === id) ?? null);
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    writes.push({ kind: "create", data });
    const row = { id: rows.length + 1, ...data.set };
    rows.push(row);
    return Promise.resolve(row);
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    writes.push({ kind: "update", id, data });
    const row = { ...rows.find((r) => r["id"] === id), ...data.set } as Row;
    return Promise.resolve(row);
  }
  delete(): Promise<number> {
    throw new Error("not needed here");
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
      user?: { id: string };
    }>();
    request.user = { id: request.headers["x-user"] ?? "nobody" };
    return true;
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title").required(),
      TextInput.make("body"),
      TextInput.make("password").password(),
      TextInput.make("internalNote").visible(() => false),
      TextInput.make("computed").readOnly(),
    ]);
  }
  can: Authorization = {
    update: (user, record) =>
      (record as Row)["authorId"] === (user as { id: string } | undefined)?.id,
  };
  mutateFormDataBeforeCreate(data: Record<string, unknown>): Record<string, unknown> {
    // What this hook is for.
    return { ...data, password: `hashed:${String(data["password"])}` };
  }
  mutateFormDataBeforeSave(data: Record<string, unknown>): Record<string, unknown> {
    return { ...data, updatedBy: "hook" };
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-save-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication | undefined;

beforeEach(() => {
  rows = [{ id: 1, title: "Ada's post", authorId: "ada" }];
  writes = [];
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(
  withAdapter = true,
  globalPrefix?: string,
  redirectAfterCreate?: "edit" | "index" | "none",
): Promise<string> {
  const base = {
    path: "/admin",
    resources: [PostResource],
    guards: [HeaderGuard],
    assets: assets(),
    ...(redirectAfterCreate === undefined ? {} : { redirectAfterCreate }),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot(withAdapter ? { ...base, dataAdapter: MemoryAdapter } : base),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  if (globalPrefix !== undefined) app.setGlobalPrefix(globalPrefix);
  await app.listen(0);
  return await app.getUrl();
}

async function send(
  url: string,
  path: string,
  method: string,
  state: Record<string, unknown>,
  user = "ada",
): Promise<{ status: number; body: SaveResponse }> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "x-user": user, "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return {
    status: response.status,
    body: response.ok ? ((await response.json()) as SaveResponse) : {},
  };
}

const created = (): WriteTree["set"] => writes.at(-1)?.data.set;

describe("creating", () => {
  it("writes what the form carries", async () => {
    const url = await serve();
    const { status, body } = await send(url, "/admin/api/posts", "POST", {
      title: "New",
      password: "secret",
    });

    expect(status).toBe(200);
    // The answer carries the key and nothing else; what was written is read
    // from the store, which is where it matters.
    expect(Object.keys(body.record ?? {})).toEqual(["id"]);
    expect(created()?.["title"]).toBe("New");
  });

  it("never hands the hashed password back to the browser", async () => {
    // The hook writes it under the field's own name, so "answer with what the
    // form declared" is not narrow enough — the answer is the key alone.
    const url = await serve();
    const { body } = await send(url, "/admin/api/posts", "POST", {
      title: "New",
      password: "secret",
    });

    expect(created()?.["password"]).toBe("hashed:secret");
    expect(JSON.stringify(body.record)).not.toContain("hashed");
    expect(body.record).not.toHaveProperty("password");
  });

  it("runs mutateFormDataBeforeCreate on the way out", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts", "POST", { title: "New", password: "secret" });

    expect(created()?.["password"]).toBe("hashed:secret");
  });
});

describe("where a create lands", () => {
  it("names the edit page of the row it just wrote", async () => {
    const url = await serve();
    const { body } = await send(url, "/admin/api/posts", "POST", { title: "New" });

    expect(body.redirect).toBe(`/admin/posts/${String(body.record?.["id"])}/edit`);
  });

  it("keeps the panel root it was reached through", async () => {
    // The host may add a prefix, and the redirect has to survive it.
    const url = await serve(true, "api/v1");
    const response = await fetch(`${url}/api/v1/admin/api/posts`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "New" } }),
    });
    const body = (await response.json()) as SaveResponse;

    expect(body.redirect).toContain("/api/v1/admin/posts/");
  });

  it("lands on the list when the panel asks for the index", async () => {
    // Three targets are named; `index` is the one the list page made buildable,
    // and it is what a developer declares.
    const url = await serve(true, undefined, "index");
    const { body } = await send(url, "/admin/api/posts", "POST", { title: "New" });

    expect(body.redirect).toBe("/admin/posts");
  });

  it("keeps the host's prefix on the way to the list", async () => {
    const url = await serve(true, "api/v1", "index");
    const response = await fetch(`${url}/api/v1/admin/api/posts`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "New" } }),
    });
    const body = (await response.json()) as SaveResponse;

    expect(body.redirect).toBe("/api/v1/admin/posts");
  });

  it("says nothing when the panel asks it not to", async () => {
    const url = await serve(true, undefined, "none");
    const { body } = await send(url, "/admin/api/posts", "POST", { title: "New" });

    expect(body.record).toBeDefined();
    expect(body.redirect).toBeUndefined();
  });

  it("sends nowhere after an update, which is already where it belongs", async () => {
    const url = await serve();
    const { body } = await send(url, "/admin/api/posts/1", "PATCH", {
      title: "Edited",
    });

    expect(body.redirect).toBeUndefined();
  });
});

describe("what never reaches the adapter", () => {
  it("drops a value for a field the form hides", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts", "POST", {
      title: "New",
      internalNote: "forged",
    });

    expect(created()).not.toHaveProperty("internalNote");
    expect(JSON.stringify(writes)).not.toContain("forged");
  });

  it("drops a value for a read-only field", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts", "POST", { title: "New", computed: "forged" });

    expect(created()).not.toHaveProperty("computed");
  });

  it("drops a path the form does not know", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts", "POST", { title: "New", isAdmin: true });

    expect(created()).not.toHaveProperty("isAdmin");
  });
});

describe("validation happens before the write", () => {
  it("answers with the errors and writes nothing", async () => {
    const url = await serve();
    const { status, body } = await send(url, "/admin/api/posts", "POST", { title: "" });

    expect(status).toBe(200);
    expect(body.errors?.["title"]).toBeDefined();
    expect(body.record).toBeUndefined();
    expect(writes).toHaveLength(0);
  });

  it("hands back the tree so the errors can be shown in place", async () => {
    const url = await serve();
    const { body } = await send(url, "/admin/api/posts", "POST", { title: "" });

    expect(body.payload?.schema).toBeDefined();
  });
});

describe("updating", () => {
  it("writes to the row named in the path", async () => {
    const url = await serve();
    const { status } = await send(url, "/admin/api/posts/1", "PATCH", {
      title: "Edited",
    });

    expect(status).toBe(200);
    expect(writes.at(-1)?.kind).toBe("update");
    expect(writes.at(-1)?.id).toBe(1);
    expect(created()?.["title"]).toBe("Edited");
  });

  it("runs mutateFormDataBeforeSave, not the create hook", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts/1", "PATCH", { title: "Edited" });

    expect(created()?.["updatedBy"]).toBe("hook");
    expect(created()?.["password"]).toBeUndefined();
  });

  it("leaves a field the form did not carry out of the write", async () => {
    // Otherwise the key travels with no value, and every adapter decides for
    // itself whether that means "leave it" or "clear it".
    const url = await serve();
    await send(url, "/admin/api/posts/1", "PATCH", { title: "Edited" });

    expect(Object.keys(created() ?? {})).toEqual(["title", "updatedBy"]);
  });

  it("still writes a value the form cleared on purpose", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts/1", "PATCH", { title: "Edited", body: null });

    expect(created()).toHaveProperty("body", null);
  });

  it("refuses somebody who does not own the row, before writing", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/api/posts/1`, {
      method: "PATCH",
      headers: { "x-user": "grace", "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "Stolen" } }),
    });

    expect(response.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  it("refuses a row that is not there", async () => {
    const url = await serve();

    expect((await send(url, "/admin/api/posts/99", "PATCH", {})).status).toBe(404);
    expect((await send(url, "/admin/api/posts/abc", "PATCH", {})).status).toBe(404);
  });
});

describe("without an adapter", () => {
  it("has no such route to a caller", async () => {
    const url = await serve(false);

    expect((await send(url, "/admin/api/posts", "POST", { title: "New" })).status).toBe(
      404,
    );
  });
});

describe("the routes it sits beside", () => {
  it("still answers /state and the pages", async () => {
    const url = await serve();

    expect(
      (
        await fetch(`${url}/admin/api/posts/state`, {
          method: "POST",
          headers: { "x-user": "ada", "content-type": "application/json" },
          body: JSON.stringify({ state: {}, dirtyPath: "title", operation: "create" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await fetch(`${url}/admin/posts/create`, { headers: { "x-user": "ada" } }))
        .status,
    ).toBe(200);
  });
});
