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
import type {
  DataAdapter,
  FieldMeta,
  Id,
  Ir,
  ModelMeta,
  Row,
  WriteTree,
} from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import type { SaveResponse } from "./panel-save.controller.js";

const KEY: FieldMeta = {
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
};

const META: ModelMeta = {
  name: "Post",
  dbName: "Post",
  primaryKey: KEY,
  fields: [KEY],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "title",
};

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
    // The use PRD 05 names for this hook.
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

async function serve(withAdapter = true): Promise<string> {
  const base = {
    path: "/admin",
    resources: [PostResource],
    guards: [HeaderGuard],
    assets: assets(),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot(withAdapter ? { ...base, dataAdapter: MemoryAdapter } : base),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
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
    expect(body.record?.["title"]).toBe("New");
    expect(created()?.["title"]).toBe("New");
  });

  it("runs mutateFormDataBeforeCreate on the way out", async () => {
    const url = await serve();
    await send(url, "/admin/api/posts", "POST", { title: "New", password: "secret" });

    expect(created()?.["password"]).toBe("hashed:secret");
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
