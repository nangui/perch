/**
 * `GET {path}/:resource/:id/edit` — the create page's twin, except that there is
 * a row behind it, and everything that follows from there.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Row, SchemaPayload } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const ROWS: Row[] = [
  {
    id: 1,
    title: "Ada's post",
    body: "…",
    authorId: "ada",
    secretScore: 42,
    draftNote: "not for the browser",
  },
  { id: 2, title: "Grace's post", body: "…", authorId: "grace", secretScore: 7 },
];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [] };
  }
  meta(): ModelMeta {
    // Strictly what the panel asks of it: the type of the key it looks rows up
    // by.
    return {
      name: "Post",
      dbName: "Post",
      primaryKey: {
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
      },
      fields: [],
      relations: [],
      uniqueConstraints: [],
      hasSoftDelete: false,
      labelField: "title",
    };
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: ROWS, total: ROWS.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    // As unforgiving as a typed client: the key is an Int, so anything else
    // raises rather than politely finding nothing. Coercing here, or shrugging,
    // would hide whether the panel hands over the type the model declares.
    if (!Number.isInteger(id)) {
      // NaN is a number to `typeof`, and an Int column refuses it all the same.
      throw new TypeError(`id must be an Int, received ${String(id)}`);
    }
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

@PanelResource({ model: "Post", slug: "posts", label: "Post" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title"),
      TextInput.make("body"),
      // Never on the page, so its value must never travel either.
      TextInput.make("draftNote").visible(() => false),
    ]);
  }
  can: Authorization = {
    update: (user, record) =>
      (record as Row)["authorId"] === (user as { id: string } | undefined)?.id,
  };
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-edit-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(withAdapter = true, globalPrefix?: string): Promise<string> {
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
  if (globalPrefix !== undefined) app.setGlobalPrefix(globalPrefix);
  await app.listen(0);
  return await app.getUrl();
}

const get = (url: string, path: string, user = "ada"): Promise<Response> =>
  fetch(`${url}${path}`, { headers: { "x-user": user } });

function payloadOf(html: string): SchemaPayload {
  const raw = /data-payload="([^"]*)"/.exec(html)?.[1] ?? "";
  return JSON.parse(
    raw
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&"),
  ) as SchemaPayload;
}

describe("the page carries the row", () => {
  it("fills the form with what is stored", async () => {
    const html = await (await get(await serve(), "/admin/posts/1/edit")).text();
    const payload = payloadOf(html);

    expect(payload.state["title"]).toBe("Ada's post");
    expect(payload.state["body"]).toBe("…");
  });

  it("says it is an edit in the title", async () => {
    const html = await (await get(await serve(), "/admin/posts/1/edit")).text();

    expect(html).toContain("<title>Edit Post</title>");
  });

  it("points its API at the same place the create page does", async () => {
    const url = await serve();
    const edit = await (await get(url, "/admin/posts/1/edit")).text();
    const create = await (await get(url, "/admin/posts/create")).text();

    expect(edit).toContain('data-api="/admin/api/posts"');
    expect(create).toContain('data-api="/admin/api/posts"');
  });

  it("keeps its URLs right one segment deeper, under a prefix", async () => {
    // The root is stripped off the URL, and this route is a segment longer than
    // the create one.
    const url = await serve(true, "api/v1");
    const html = await (await get(url, "/api/v1/admin/posts/1/edit")).text();

    expect(html).toContain('data-api="/api/v1/admin/api/posts"');
    expect(html).toContain('src="/api/v1/admin/assets/panel-a1b2c3d4.js"');
  });
});

describe("what the row does not put on the wire", () => {
  it("leaves out a column the form does not carry", async () => {
    const html = await (await get(await serve(), "/admin/posts/1/edit")).text();

    expect(payloadOf(html).state["secretScore"]).toBeUndefined();
    expect(html).not.toContain("42");
  });

  it("leaves out a field the form hides", async () => {
    const html = await (await get(await serve(), "/admin/posts/1/edit")).text();
    const payload = payloadOf(html);

    expect(payload.state["draftNote"]).toBeUndefined();
    expect(payload.schema.children?.map((node) => node.path)).not.toContain(
      "draftNote",
    );
    // The row does hold one. Hiding the field on the client would still have
    // put its value on the wire.
    expect(html).not.toContain("not for the browser");
  });
});

describe("who may open it", () => {
  it("refuses somebody who does not own the row", async () => {
    expect((await get(await serve(), "/admin/posts/1/edit", "grace")).status).toBe(404);
  });

  it("answers the same for a row that is not there", async () => {
    const url = await serve();
    const refused = await get(url, "/admin/posts/1/edit", "grace");
    const absent = await get(url, "/admin/posts/99/edit");

    expect(refused.status).toBe(absent.status);
    expect(await refused.text()).toBe(await absent.text());
  });

  it("refuses when there is no adapter to load from", async () => {
    expect((await get(await serve(false), "/admin/posts/1/edit")).status).toBe(404);
  });
});

describe("the id it hands the adapter", () => {
  it("is the type the model declares, from either entry point", async () => {
    // A URL segment is always a string and a JSON body keeps its own type, so
    // without this the same row is reachable from one route and not the other.
    const url = await serve();
    const page = await get(url, "/admin/posts/1/edit");
    const state = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({ state: {}, dirtyPath: "title", operation: "edit", id: 1 }),
    });

    expect(page.status).toBe(200);
    expect(state.status).toBe(200);
  });

  it("reads a string key as a string", async () => {
    const url = await serve();
    const state = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({
        state: {},
        dirtyPath: "title",
        operation: "edit",
        id: "1",
      }),
    });

    expect(state.status).toBe(200);
  });
});

describe("a key no row can carry", () => {
  it.each(["abc", "1.5", "%20"])("answers 404 for /posts/%s/edit", async (id) => {
    // Not 500. A stack trace here would tell a caller its key was the wrong
    // shape rather than the wrong value, which is a distinction worth nothing
    // to them and something to somebody mapping the panel.
    const url = await serve();

    expect((await get(url, `/admin/posts/${id}/edit`)).status).toBe(404);
  });

  it("answers 404 on the API too", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({
        state: {},
        dirtyPath: "title",
        operation: "edit",
        id: "abc",
      }),
    });

    expect(response.status).toBe(404);
  });

  it("is the same answer a row that is not there gives", async () => {
    const url = await serve();
    const malformed = await get(url, "/admin/posts/abc/edit");
    const absent = await get(url, "/admin/posts/99/edit");

    expect(malformed.status).toBe(absent.status);
    expect(await malformed.text()).toBe(await absent.text());
  });
});

describe("it does not shadow its neighbours", () => {
  it("leaves the create page and the assets alone", async () => {
    const url = await serve();

    expect((await get(url, "/admin/posts/create")).status).toBe(200);
    expect((await get(url, "/admin/assets/panel-a1b2c3d4.js")).status).toBe(200);
  });
});
