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
  FileUpload,
  Hidden,
  Schema,
  Select,
  SelectColumn,
  Table,
  TextColumn,
  TextInput,
  TextInputColumn,
  Toggle,
  ToggleColumn,
} from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { CellWriteResponse } from "./cell-write.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { RelationManager } from "./relation-manager.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

const META = model({
  fields: [
    key(),
    scalar("title"),
    scalar("active", { type: "Boolean" }),
    scalar("onCall", { type: "Boolean" }),
    scalar("locked", { type: "Boolean" }),
    scalar("sealed", { type: "Boolean" }),
    scalar("note"),
    scalar("role"),
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
      // Offered by the table and refused by the form, on every row.
      Toggle.make("sealed").disabled(() => true),
      TextInput.make("note").maxLength(20),
      Select.make("role").options({ lead: "Lead", member: "Member" }),
    ]);
  }
  table(): TableTree {
    return Table.make().columns([
      TextColumn.make("title"),
      ToggleColumn.make("active"),
      CheckboxColumn.make("onCall"),
      // Drawn, never written: a column that only reads.
      TextColumn.make("locked"),
      ToggleColumn.make("sealed"),
      TextInputColumn.make("note"),
      SelectColumn.make("role"),
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
  rows = [
    {
      id: 1,
      title: "Ada",
      active: false,
      onCall: false,
      locked: false,
      sealed: false,
      note: "short",
      role: "lead",
    },
  ];
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

/** Starting a panel with one resource in it, and nothing else. */
const boot = async (resource: unknown): Promise<void> => {
  const ref = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [resource as never],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  const started = ref.createNestApplication();
  await started.init();
  await started.close();
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

describe("what the table tells the browser about a text cell", () => {
  it("hands on what the field says about itself", async () => {
    // The form owns the rules, so the cell is told rather than asked to guess.
    const response = await fetch(`${url}/admin/api/people/records`);
    const body = (await response.json()) as {
      columns: { columns: { path: string; maxLength?: number }[] };
    };
    const note = body.columns.columns.find((one) => one.path === "note");

    expect(note?.maxLength).toBe(20);
  });
});

describe("a line of text written from a table", () => {
  it("writes what was typed", async () => {
    const { status, body } = await write({ path: "note", value: "a longer note" });

    expect(status).toBe(200);
    expect(body.value).toBe("a longer note");
    expect(writes).toEqual([{ id: 1, data: { set: { note: "a longer note" } } }]);
  });

  it("clears the cell where the reader emptied it", async () => {
    const { status, body } = await write({ path: "note", value: "" });

    expect(status).toBe(200);
    expect(body.value).toBe("");
  });

  it("keeps the form's own rules, and says which one refused", async () => {
    // The whole point of writing through the form: `maxLength` is declared
    // once, on the field, and a table cannot get around it.
    const { status, body } = await write({
      path: "note",
      value: "far longer than twenty characters",
    });

    expect(status).toBe(200);
    expect(body.value).toBe("short");
    expect(body.notification?.tone).toBe("danger");
    expect(writes).toEqual([]);
  });

  it("refuses a value that is not text at all", async () => {
    expect((await write({ path: "note", value: 12 })).status).toBe(404);
    expect((await write({ path: "note", value: true })).status).toBe(404);
    expect(writes).toEqual([]);
  });
});

describe("a choice written from a table", () => {
  it("hands the field's own list to the browser", async () => {
    // The choices are the field's. A column that declared its own would be a
    // second list to keep in step, and the one that drifted would be the one
    // nobody looked at.
    const response = await fetch(`${url}/admin/api/people/records`);
    const body = (await response.json()) as {
      columns: { columns: { path: string; options?: { value: unknown }[] }[] };
    };
    const role = body.columns.columns.find((one) => one.path === "role");

    expect(role?.options?.map((one) => one.value)).toEqual(["lead", "member"]);
  });

  it("writes a choice the field declared", async () => {
    const { status, body } = await write({ path: "role", value: "member" });

    expect(status).toBe(200);
    expect(body.value).toBe("member");
    expect(writes).toEqual([{ id: 1, data: { set: { role: "member" } } }]);
  });

  it("refuses one it did not, whatever the cell sent", async () => {
    // Membership is the field's answer, given once, at the boundary.
    const { status, body } = await write({ path: "role", value: "owner" });

    expect(status).toBe(200);
    expect(body.value).toBe("lead");
    expect(body.notification?.tone).toBe("warning");
    expect(writes).toEqual([]);
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

describe("a control the form refuses on the row", () => {
  it("changes nothing, and says so rather than flipping back in silence", async () => {
    // The boundary is silent for a path a client typed. This control was drawn
    // by the server, and a switch that flips back for ever with nothing said is
    // a panel that looks broken to the one person who trusted it.
    const { status, body } = await write({ path: "sealed", value: true });

    expect(status).toBe(200);
    expect(body.value).toBe(false);
    expect(body.notification?.tone).toBe("warning");
    expect(writes).toEqual([]);
  });
});

describe("a control the form cannot carry", () => {
  it("stops the boot where the field holds something else entirely", async () => {
    // The path existing is not enough: a text field takes any scalar, so a
    // switch over one wrote `true` into a text column and nothing objected.
    @PanelResource({ model: "Person", slug: "mistyped" })
    class MistypedResource {
      form(): Schema {
        return Schema.make([TextInput.make("title")]);
      }
      table(): TableTree {
        return Table.make().columns([ToggleColumn.make("title")]);
      }
    }

    await expect(boot(MistypedResource)).rejects.toThrow(
      /offers a ToggleColumn in the table over a TextInput/,
    );
  });

  it("stops the boot over a field no client may set at all", async () => {
    // A hidden field takes text and takes anything else, so it answers yes to
    // every question a column asks about shape. What it does not do is accept
    // client state, and the write would be turned away before anything read it.
    @PanelResource({ model: "Person", slug: "hiding" })
    class HidingResource {
      form(): Schema {
        return Schema.make([Hidden.make("title").default("x")]);
      }
      table(): TableTree {
        return Table.make().columns([TextInputColumn.make("title")]);
      }
    }

    await expect(boot(HidingResource)).rejects.toThrow(/no client may set/);
  });

  it("stops the boot over a list that is not written down", async () => {
    // A list from a resolver is a different list per row, and a list from a
    // relationship is a query per row. Both are a page of dropdowns nobody
    // asked for, so a cell may not offer either.
    @PanelResource({ model: "Person", slug: "resolved" })
    class ResolvedResource {
      form(): Schema {
        return Schema.make([Select.make("title").options(() => ({ a: "A" }))]);
      }
      table(): TableTree {
        return Table.make().columns([SelectColumn.make("title")]);
      }
    }

    await expect(boot(ResolvedResource)).rejects.toThrow(
      /offers a SelectColumn in the table over a Select/,
    );
  });

  it("stops the boot over a field that takes text and is not text", async () => {
    // A stored file key is a string, and a colour is a string. What a free-text
    // field has is no shape at all — it takes a string and anything else — so
    // asking only "does it take a string" would offer a box over an upload.
    @PanelResource({ model: "Person", slug: "shaped" })
    class ShapedResource {
      form(): Schema {
        return Schema.make([FileUpload.make("title").disk("default")]);
      }
      table(): TableTree {
        return Table.make().columns([TextInputColumn.make("title")]);
      }
    }

    await expect(boot(ShapedResource)).rejects.toThrow(
      /offers a TextInputColumn in the table over a FileUpload/,
    );
  });

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

    await expect(boot(GhostResource)).rejects.toThrow(/active/);
  });
});

describe("a control inside a relation manager", () => {
  it("stops the boot, because nothing there would carry it", async () => {
    // A manager's rows are listed by a route that does not say who may write
    // them, and there is no route to write one through.
    @PanelResource({ model: "Person", slug: "parents" })
    class ParentResource {
      form(): Schema {
        return Schema.make([TextInput.make("title")]);
      }
      relations(): readonly RelationManager[] {
        return [
          RelationManager.make("children").table((table) =>
            table.columns([ToggleColumn.make("active")]),
          ),
        ];
      }
    }

    await expect(boot(ParentResource)).rejects.toThrow(/children\.active/);
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
