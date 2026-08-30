/**
 * Making the option a select is missing, from inside the form that needs it.
 *
 * The row lands in another table, which is the whole of what makes this
 * delicate: it is a create on that model, so it is that model's `can()` that
 * decides — not the one belonging to the form the reader happens to be looking
 * at. A form open to everyone must not become a door into a table that is not.
 *
 * The other half is what comes back. A select's list is a window onto a table,
 * and a row created a second ago is not in the window that was sent, so the
 * server returns the whole host form resolved again with the choice already in
 * it. A client left to apply the value itself would be holding a choice its own
 * list cannot show.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  SchemaNode,
  SchemaPayload,
  WriteTree,
} from "@perchjs/core";
import { Repeater, Schema, Select, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const IR = {
  models: [
    {
      name: "Post",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "title", type: "String" },
        { name: "authorId", type: "Int" },
        { name: "hiddenId", type: "Int" },
      ],
      relations: [
        {
          name: "author",
          type: "many-to-one",
          targetModel: "Author",
          foreignKeyFields: ["authorId"],
          referencedFields: ["id"],
          isList: false,
        },
        {
          name: "notes",
          type: "one-to-many",
          targetModel: "Note",
          foreignKeyFields: ["postId"],
          referencedFields: ["id"],
          isList: true,
        },
      ],
      primaryKey: "id",
      hasSoftDelete: false,
    },
    {
      name: "Note",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "body", type: "String" },
        { name: "postId", type: "Int" },
        { name: "authorId", type: "Int" },
      ],
      relations: [
        {
          name: "author",
          type: "many-to-one",
          targetModel: "Author",
          foreignKeyFields: ["authorId"],
          referencedFields: ["id"],
          isList: false,
        },
      ],
      primaryKey: "id",
      hasSoftDelete: false,
    },
    {
      name: "Author",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "name", type: "String" },
      ],
      relations: [],
      primaryKey: "id",
      hasSoftDelete: false,
    },
  ],
} as unknown as Ir;

let authors: Row[] = [];
let written: { model: string; data: WriteTree }[] = [];

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return IR;
  }
  meta(model: string): ModelMeta {
    return {
      name: model,
      primaryKey: { name: "id", type: "Int" },
    } as unknown as ModelMeta;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    if (query.model !== "Author") return Promise.resolve({ rows: [], total: 0 });
    const rows = [...authors].sort((a, b) =>
      String(a["name"]).localeCompare(String(b["name"])),
    );
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(id === 1 ? { id: 1, authorId: 2 } : null);
  }
  create(model: string, data: WriteTree): Promise<Row> {
    written.push({ model, data });
    const row: Row = { id: authors.length + 20, ...data.set };
    if (model === "Author") authors.push(row);
    return Promise.resolve(row);
  }
  update(): Promise<Row> {
    return Promise.resolve({ id: 1 });
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
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

@PanelResource({ model: "Author", slug: "authors" })
class AuthorResource {
  form(): Schema {
    return Schema.make([TextInput.make("name").required()]);
  }
}

/** The one the dialog writes into, for a reader who may not write into it. */
@PanelResource({ model: "Author", slug: "shut-authors" })
class ShutAuthorResource {
  readonly can = { create: () => false, edit: () => false, view: () => false };
  form(): Schema {
    return Schema.make([TextInput.make("name").required()]);
  }
}

const creating = (): Select =>
  Select.make("authorId")
    .relationship("author", "name")
    .createOptionForm(Schema.make([TextInput.make("name").required()]));

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title"),
      creating(),
      // Never reachable, so neither is the dialog behind it.
      Select.make("hiddenId")
        .relationship("author", "name")
        .createOptionForm(Schema.make([TextInput.make("name").required()]))
        .visible(() => false),
    ]);
  }
}

/** The same offer, made from inside a repeater. */
@PanelResource({ model: "Post", slug: "nested" })
class NestedResource {
  form(): Schema {
    return Schema.make([
      Repeater.make("notes").schema([
        TextInput.make("body"),
        Select.make("authorId")
          .relationship("author", "name")
          .createOptionForm(Schema.make([TextInput.make("name").required()])),
      ]),
    ]);
  }
}

/** The other offer the same route serves, made from the same place. */
@PanelResource({ model: "Post", slug: "nested-search" })
class NestedSearchResource {
  form(): Schema {
    return Schema.make([
      Repeater.make("notes").schema([
        TextInput.make("body"),
        Select.make("authorId").relationship("author", "name").searchable(),
      ]),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-create-option-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication;
let url: string;

async function boot(resources: readonly unknown[]): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: resources as never,
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
}

beforeEach(() => {
  authors = [
    { id: 2, name: "Ada" },
    { id: 7, name: "Grace" },
  ];
  written = [];
});

afterEach(async () => {
  await app.close();
});

const post = async (
  route: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${url}/admin/api/posts/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
};

const asking = (data: Record<string, unknown> = {}): Record<string, unknown> => ({
  state: {},
  operation: "create",
  path: "authorId",
  data,
});

/** The node at a path, wherever the tree put it. */
function nodeAt(node: SchemaNode, path: string): SchemaNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = nodeAt(child, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("the dialog a select opens", () => {
  beforeEach(async () => {
    await boot([PostResource, AuthorResource]);
  });

  it("is served on its own, rather than carried by every page", async () => {
    const answer = await post("options/form", asking());
    const payload = answer.body as SchemaPayload;

    expect(answer.status).toBe(200);
    expect(nodeAt(payload.schema, "name")?.type).toBe("TextInput");
  });

  it("is resolved against what has been typed into it", async () => {
    // The same route both times, which is what makes a dependent field inside
    // the dialog work without a second channel that could resolve it
    // differently.
    const answer = await post("options/form", asking({ name: "Alan" }));
    const payload = answer.body as SchemaPayload;

    expect(payload.state["name"]).toBe("Alan");
  });

  it("is not served for a field the reader cannot reach", async () => {
    const answer = await post("options/form", { ...asking(), path: "hiddenId" });
    expect(answer.status).toBe(404);
  });

  it("is not served for a field that never offered it", async () => {
    const answer = await post("options/form", { ...asking(), path: "title" });
    expect(answer.status).toBe(404);
  });
});

describe("creating the option", () => {
  beforeEach(async () => {
    await boot([PostResource, AuthorResource]);
  });

  it("writes the row in the model the relation points at", async () => {
    const answer = await post("options/create", asking({ name: "Alan" }));

    expect(answer.status).toBe(200);
    expect(written.map((one) => one.model)).toEqual(["Author"]);
    expect(written[0]?.data.set).toMatchObject({ name: "Alan" });
  });

  it("answers with the option, keyed by the column the select carries", async () => {
    const answer = await post("options/create", asking({ name: "Alan" }));
    const body = answer.body as { option: { value: unknown; label: string } };

    expect(body.option.label).toBe("Alan");
    expect(body.option.value).toBe(authors.at(-1)?.["id"]);
  });

  it("answers with the host form, resolved with the choice in it", async () => {
    // The point of the whole route. A browser told only the value would be
    // holding a choice its own list cannot show — the list it was sent was a
    // window onto the table, from before this row existed.
    const answer = await post("options/create", asking({ name: "Alan" }));
    const body = answer.body as { option: { value: unknown }; payload: SchemaPayload };

    expect(body.payload.state["authorId"]).toBe(body.option.value);
    const node = nodeAt(body.payload.schema, "authorId");
    expect(node?.options?.map((one) => one.label)).toContain("Alan");
  });

  it("keeps what was already typed into the host form", async () => {
    const answer = await post("options/create", {
      ...asking({ name: "Alan" }),
      state: { title: "Half written" },
    });
    const body = answer.body as { payload: SchemaPayload };

    expect(body.payload.state["title"]).toBe("Half written");
  });

  it("writes nothing when the dialog does not pass its own rules", async () => {
    const answer = await post("options/create", asking({ name: "" }));
    const body = answer.body as { errors: Record<string, string> };

    expect(body.errors["name"]).toBeDefined();
    expect(written).toEqual([]);
  });

  it("is refused for a field the reader cannot reach", async () => {
    const answer = await post("options/create", {
      ...asking({ name: "Alan" }),
      path: "hiddenId",
    });

    expect(answer.status).toBe(404);
    expect(written).toEqual([]);
  });
});

/** Neither offer, so nothing a route has to reach. */
@PanelResource({ model: "Post", slug: "plain-nested" })
class PlainNestedResource {
  form(): Schema {
    return Schema.make([
      Repeater.make("notes").schema([
        TextInput.make("body"),
        Select.make("authorId").relationship("author", "name"),
      ]),
    ]);
  }
}

/** What the boot said, or that it did not speak. */
const started = async (resources: readonly unknown[]): Promise<string> => {
  try {
    await boot(resources);
    return "(it started)";
  } catch (error) {
    app = { close: () => Promise.resolve() } as unknown as INestApplication;
    return error instanceof Error ? error.message : String(error);
  }
};

describe("a select inside a repeater", () => {
  it("stops the boot, because nothing could ever serve its dialog", async () => {
    // A repeater's rows are resolved one at a time, under the repeater — its
    // children are not in the form tree the routes read. So the field can be
    // declared, drawn and pressed, and the route that serves the dialog will
    // never find it. Said where the line is written rather than left to answer
    // nothing on a page.
    const message = await started([NestedResource, AuthorResource]);

    expect(message).toContain("resolved one at a time");
    expect(message).toContain("offers to create an option");
  });

  it("stops it for a search box, which would answer every term the same", () => {
    // The same silence worn differently. Nothing serves the typing, so the box
    // answers with the list it already had, for every term there is.
    return started([NestedSearchResource, AuthorResource]).then((message) => {
      expect(message).toContain("is searchable");
      expect(message).toContain("resolved one at a time");
    });
  });

  it("says nothing about a select in there that asks for neither", () => {
    // A plain relationship select works in a repeater: its window is loaded
    // when the row is resolved. Only the two things needing a route of their
    // own are undeliverable.
    return started([PlainNestedResource, AuthorResource]).then((message) => {
      expect(message).toBe("(it started)");
    });
  });
});

describe("who may create one", () => {
  it("is the other model's question, not this form's", async () => {
    // The post form is open to everyone; the author resource is not. A reader
    // who may fill in a post must not thereby be able to write an author.
    await boot([PostResource, ShutAuthorResource]);
    const answer = await post("options/create", asking({ name: "Alan" }));

    expect(answer.status).toBe(404);
    expect(written).toEqual([]);
  });

  it("is asked before the dialog is even drawn", async () => {
    await boot([PostResource, ShutAuthorResource]);
    expect((await post("options/form", asking())).status).toBe(404);
  });
});

describe("what the boot refuses", () => {
  afterEach(() => {
    // `boot` may never have assigned one, and closing twice throws.
    app = { close: () => Promise.resolve() } as unknown as INestApplication;
  });

  it("stops where no resource stands for the model being written", async () => {
    // Without one there is no `can()` to ask, and the dialog would write a row
    // that nothing authorised.
    expect(await started([PostResource])).toContain("no resource");
  });

  it("stops where two resources stand for it", async () => {
    // Which of their `can()` decides would be settled by registration order,
    // which is a coin flip nobody would see land.
    expect(await started([PostResource, AuthorResource, ShutAuthorResource])).toContain(
      "2 resources stand for that model",
    );
  });

  it("says nothing where exactly one does", async () => {
    expect(await started([PostResource, AuthorResource])).toBe("(it started)");
  });
});
