/**
 * A column this reader may not have.
 *
 * Not the same as one they may take off, and the difference is the whole
 * reason this exists. A column toggled off is a column whose values were read,
 * sent and are sitting in the page; one refused here is not in the table at
 * all, so its values are not projected, not presented and never leave the
 * server. A salary column hidden by styling is a salary column in the
 * response.
 *
 * Decided once per request, with the reader, the way a heading's label is
 * decided once for the table. Per row would be the heading equivalent of N+1,
 * and a column that came and went down a page is not one anybody can read.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Row } from "@perchjs/core";
import { Schema, Table, TextColumn, TextInput, TextInputColumn } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const ROWS: Row[] = [{ id: 1, name: "Ada", salary: 90000 }];

const isAdmin = (user: unknown): boolean =>
  (user as { role?: string } | undefined)?.role === "admin";

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [this.meta()] };
  }
  meta(): ModelMeta {
    return model({ name: "Person", fields: [key(), scalar("name"), scalar("salary")] });
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: ROWS, total: ROWS.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(
    _model: string,
    id: Id,
    data: { set?: Record<string, unknown> },
  ): Promise<Row> {
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

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    request.user = { role: request.headers["x-role"] ?? "visitor" };
    return true;
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PeopleResource {
  form(): Schema {
    return Schema.make([TextInput.make("name"), TextInput.make("salary")]);
  }
  table(): Table {
    return Table.make().columns([
      TextColumn.make("name"),
      TextInputColumn.make("salary").visible(isAdmin).sortable().searchable(),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-col-visible-"));
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

async function serve(): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PeopleResource],
        dataAdapter: MemoryAdapter,
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

interface Records {
  readonly rows: readonly Row[];
  readonly columns: {
    readonly columns: readonly { readonly path: string }[];
    readonly searchable?: true;
  };
  readonly sort?: { readonly path: string };
}

const records = async (url: string, role: string): Promise<Records> =>
  (await (
    await fetch(`${url}/admin/api/people/records`, { headers: { "x-role": role } })
  ).json()) as Records;

describe("ordering and searching by a column a reader may not have", () => {
  // The oracle this whole declaration would leak without. Sorting by a column
  // reveals the order of its values and searching one answers whether any row
  // matches, which is the reason `sortable()` and `searchable()` are
  // permissions rather than conveniences. A column refused to this reader must
  // not become either by the back door.
  it("is not a column they may order by", async () => {
    const url = await serve();
    const answer = (await (
      await fetch(`${url}/admin/api/people/records?sort=salary&direction=asc`, {
        headers: { "x-role": "visitor" },
      })
    ).json()) as Records;

    expect(answer.sort?.path).not.toBe("salary");
  });

  it("is a column the reader who has it may order by", async () => {
    const url = await serve();
    const answer = (await (
      await fetch(`${url}/admin/api/people/records?sort=salary&direction=asc`, {
        headers: { "x-role": "admin" },
      })
    ).json()) as Records;

    expect(answer.sort?.path).toBe("salary");
  });

  it("does not make the table searchable for them", async () => {
    // `salary` is the only searchable column here. Narrowed away, the table
    // has nothing to search, and saying it does would offer a box that answers
    // questions about values this reader may not see.
    const url = await serve();

    expect((await records(url, "visitor")).columns.searchable).toBeUndefined();
    expect((await records(url, "admin")).columns.searchable).toBe(true);
  });
});

describe("writing a column a reader may not have", () => {
  it("is refused, because it is not in their table", async () => {
    // The half a hidden heading does not give on its own. The list never
    // offered the control, so a request arriving anyway is asking to write a
    // column that is not in this reader's table at all.
    const url = await serve();
    const response = await fetch(`${url}/admin/api/people/1/cell`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-role": "visitor" },
      body: JSON.stringify({ path: "salary", value: "95000" }),
    });
    const answer = (await response.json()) as { value?: unknown };

    // Answered with what is there rather than with an error: a path no column
    // declares is not news anybody outside is owed.
    expect(answer.value).not.toBe("95000");
  });

  it("is allowed for the reader who has it", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/api/people/1/cell`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-role": "admin" },
      body: JSON.stringify({ path: "salary", value: "95000" }),
    });
    const answer = (await response.json()) as { value?: unknown };

    expect(answer.value).toBe("95000");
  });
});

describe("a column a reader may not have", () => {
  it("is not in the table they are sent", async () => {
    const url = await serve();
    const paths = (await records(url, "visitor")).columns.columns.map((c) => c.path);

    expect(paths).toEqual(["name"]);
  });

  it("does not send its values either, which is the point", async () => {
    // The half that a hidden heading would not give. A column taken off by the
    // reader is still read and still sent; this one is not in the table, so
    // nothing projects it out of the row.
    const url = await serve();
    const [row] = (await records(url, "visitor")).rows;

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("salary");
    expect(row?.["name"]).toBe("Ada");
  });

  it("is there for a reader who may have it, values and all", async () => {
    const url = await serve();
    const answer = await records(url, "admin");

    expect(answer.columns.columns.map((c) => c.path)).toEqual(["name", "salary"]);
    expect(answer.rows[0]?.["salary"]).toBe(90000);
  });

  it("leaves a column that declared nothing alone", async () => {
    const url = await serve();

    for (const role of ["visitor", "admin"]) {
      const paths = (await records(url, role)).columns.columns.map((c) => c.path);
      expect(paths).toContain("name");
    }
  });
});
