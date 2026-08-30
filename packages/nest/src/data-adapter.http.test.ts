/**
 * Records exist now. What that unlocks is the half of authorisation that could
 * not be evaluated before: a check taking the row it is about.
 *
 * The adapter here holds rows in a Map. It is the port and nothing else, which
 * is the point — the panel never learns which database is behind it.
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
import { model } from "./__fixtures__/ir.js";

interface Principal {
  readonly id: string;
}

const ROWS: Row[] = [
  { id: 1, title: "Ada's post", authorId: "ada" },
  { id: 2, title: "Grace's post", authorId: "grace" },
];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [] };
  }
  meta(): ModelMeta {
    // Strictly what the panel asks of it: the type of the key it looks rows up
    // by.
    // `fields` empty on purpose: nothing here reads a column off the model.
    return model({ fields: [] });
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
  /** Not exercised here: a double that answered zero would let a test
   * pass with nothing having happened. */
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
      user?: Principal;
    }>();
    request.user = { id: request.headers["x-user"] ?? "nobody" };
    return true;
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title"),
      // Reads the row being edited, which only exists once one is loaded.
      TextInput.make("author").label(
        ({ record }) => `by ${String(record?.["authorId"])}`,
      ),
    ]);
  }
  can: Authorization = {
    update: (user, record) =>
      (record as Row)["authorId"] === (user as Principal | undefined)?.id,
  };
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-data-"));
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

async function serve(withAdapter: boolean): Promise<string> {
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

async function edit(
  url: string,
  user: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: SchemaPayload }> {
  const response = await fetch(`${url}/admin/api/posts/state`, {
    method: "POST",
    headers: { "x-user": user, "content-type": "application/json" },
    body: JSON.stringify({ state: {}, dirtyPath: "title", operation: "edit", ...body }),
  });
  return {
    status: response.status,
    payload: response.ok
      ? ((await response.json()) as SchemaPayload)
      : ({} as SchemaPayload),
  };
}

describe("a check about a row can finally be made", () => {
  it("admits the owner", async () => {
    const url = await serve(true);

    expect((await edit(url, "ada", { id: 1 })).status).toBe(200);
  });

  it("refuses anybody else, with the same answer as a missing row", async () => {
    const url = await serve(true);

    expect((await edit(url, "grace", { id: 1 })).status).toBe(404);
    expect((await edit(url, "ada", { id: 99 })).status).toBe(404);
  });
});

describe("the row reaches the resolvers", () => {
  it("is what a label about the record reads", async () => {
    const url = await serve(true);
    const { payload } = await edit(url, "ada", { id: 1 });
    const author = payload.schema.children?.find((node) => node.path === "author");

    expect(author?.label).toBe("by ada");
  });
});

describe("without an adapter", () => {
  it("refuses an edit rather than editing nothing", async () => {
    const url = await serve(false);

    expect((await edit(url, "ada", { id: 1 })).status).toBe(404);
  });

  it("still serves a create", async () => {
    const url = await serve(false);
    const response = await fetch(`${url}/admin/api/posts/state`, {
      method: "POST",
      headers: { "x-user": "ada", "content-type": "application/json" },
      body: JSON.stringify({ state: {}, dirtyPath: "title", operation: "create" }),
    });

    expect(response.status).toBe(200);
  });
});

describe("an edit has to say which row", () => {
  it("refuses a request with no id", async () => {
    const url = await serve(true);

    expect((await edit(url, "ada", {})).status).toBe(404);
  });
});
