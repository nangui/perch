/**
 * A write from a table.
 *
 * Inline editing is a write, and a write that skips the policies is a hole with
 * a nice interface. So most of what is tested here is what the route refuses —
 * a column nobody declared writable, a value no control produces, a row this
 * reader may not edit.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Row,
  Table as TableTree,
  WriteTree,
} from "@perchjs/core";
import {
  Checkbox,
  CheckboxColumn,
  Schema,
  Table,
  TextColumn,
  TextInput,
  Toggle,
  ToggleColumn,
} from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { CellWriteResponse } from "./cell-write.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const META = model({
  fields: [
    key(),
    scalar("title"),
    scalar("active", { type: "Boolean" }),
    scalar("onCall", { type: "Boolean" }),
    scalar("locked", { type: "Boolean" }),
  ],
});

let rows: Row[] = [];
let writes: { id?: Id; data: WriteTree }[] = [];
let policy: Authorization | undefined;

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
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    writes.push({ id, data });
    const row = { ...rows.find((one) => one["id"] === id), ...data.set } as Row;
    rows = rows.map((one) => (one["id"] === id ? row : one));
    return Promise.resolve(row);
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

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  get can(): Authorization {
    return policy ?? {};
  }
  form(): Schema {
    return Schema.make([
      TextInput.make("title").required(),
      Toggle.make("active"),
      Checkbox.make("onCall"),
      // Writable on the page and not from a table: the column decides whether a
      // cell offers one, and no column declares this.
      Toggle.make("locked"),
    ]);
  }
  table(): TableTree {
    return Table.make().columns([
      TextColumn.make("title"),
      ToggleColumn.make("active"),
      CheckboxColumn.make("onCall"),
      // Drawn, never written: a column that only reads.
      TextColumn.make("locked"),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-cell-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication | undefined;
let url = "";

beforeEach(async () => {
  rows = [{ id: 1, title: "Ada", active: false, onCall: false, locked: false }];
  writes = [];
  policy = undefined;

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PersonResource],
        dataAdapter: MemoryAdapter,
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const write = async (
  body: unknown,
  at = "/admin/api/people/1/cell",
  user = "ada",
): Promise<{ status: number; body: CellWriteResponse }> => {
  const response = await fetch(`${url}${at}`, {
    method: "PATCH",
    headers: { "x-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: response.ok
      ? ((await response.json()) as CellWriteResponse)
      : { value: null },
  };
};

describe("a cell a table declared writable", () => {
  it("writes the one value, and says what it holds now", async () => {
    const { status, body } = await write({ path: "active", value: true });

    expect(status).toBe(200);
    expect(body.value).toBe(true);
    expect(writes).toEqual([{ id: 1, data: { set: { active: true } } }]);
  });

  it("writes nothing else, whatever else the form has in it", async () => {
    // The row is read to resolve the form, and everything in it could be
    // written back. One column was asked for and one column is written.
    await write({ path: "onCall", value: true });

    expect(writes[0]?.data.set).toEqual({ onCall: true });
  });
});

describe("what the route refuses", () => {
  it("a column the table did not declare writable", async () => {
    const { status } = await write({ path: "locked", value: true });

    expect(status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("a path no column names at all", async () => {
    expect((await write({ path: "title", value: "Grace" })).status).toBe(404);
    expect((await write({ path: "nothing", value: true })).status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("a value no control of that kind produces", async () => {
    expect((await write({ path: "active", value: "yes" })).status).toBe(404);
    expect((await write({ path: "active", value: 1 })).status).toBe(404);
    expect((await write({ path: "active", value: null })).status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("a row nobody may edit, which is the whole point of the route", async () => {
    policy = { update: () => false };

    const { status } = await write({ path: "active", value: true });

    expect(status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("a row that is not there", async () => {
    const { status } = await write(
      { path: "active", value: true },
      "/admin/api/people/404/cell",
    );

    expect(status).toBe(404);
  });

  it("a body with nothing in it", async () => {
    // An object with no path in it names no column, which is the same answer
    // as naming one that does not exist. A body that is not an object at all
    // never reaches the handler — Nest turns it away first.
    expect((await write({})).status).toBe(404);
    expect((await write(null)).status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("a control the form cannot carry", () => {
  it("stops the boot rather than flipping and changing nothing", async () => {
    // A path the form has no field for is dropped by the trust boundary, in
    // silence. The reader would press a switch that works everywhere except on
    // the row.
    @PanelResource({ model: "Person", slug: "ghosts" })
    class GhostResource {
      form(): Schema {
        return Schema.make([TextInput.make("title")]);
      }
      table(): TableTree {
        return Table.make().columns([ToggleColumn.make("active")]);
      }
    }

    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [GhostResource],
            dataAdapter: MemoryAdapter,
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (ref) => {
          const started = ref.createNestApplication();
          await started.init();
          await started.close();
        }),
    ).rejects.toThrow(/active/);
  });
});

describe("the policy it asks", () => {
  it("is the one an edit asks, about that row", async () => {
    policy = {
      update: (user, record) =>
        (record as Row)["id"] === 1 && (user as { id: string }).id === "ada",
    };

    expect((await write({ path: "active", value: true })).status).toBe(200);
    expect(
      (await write({ path: "active", value: true }, undefined, "grace")).status,
    ).toBe(404);
  });
});
