/**
 * The route a `.searchable()` select asks when the reader types.
 *
 * Half of these are about what it refuses. A term reaching a field that never
 * said it could be searched is a way to ask which rows a relation holds, one
 * letter at a time, so every refusal here is an empty list rather than an
 * error: the answer must not say whether the field exists, whether it is a
 * relation, or whether it is protected.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Query, Row } from "@perchjs/core";
import { Schema, Select, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OptionsAnswer } from "./panel-options.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const AUTHORS: readonly Row[] = [
  { id: 2, name: "Ada" },
  { id: 7, name: "Grace" },
  { id: 9, name: "Alan" },
];

const IR = {
  models: [
    {
      name: "Post",
      fields: [
        { name: "id", type: "Int", isId: true },
        { name: "title", type: "String" },
        { name: "authorId", type: "Int" },
        { name: "hiddenId", type: "Int" },
        { name: "lockedId", type: "Int" },
        { name: "quietId", type: "Int" },
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

let queries: Query[] = [];

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return IR;
  }
  meta(): ModelMeta {
    return {
      name: "Post",
      primaryKey: { name: "id", type: "Int" },
    } as unknown as ModelMeta;
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    queries.push(query);
    const term = query.search?.term.toLowerCase();
    const rows =
      term === undefined
        ? AUTHORS
        : AUTHORS.filter((row) => String(row["name"]).toLowerCase().includes(term));
    return Promise.resolve({ rows, total: rows.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(id === 1 ? { id: 1, authorId: 2 } : null);
  }
  create(): Promise<Row> {
    return Promise.resolve({ id: 9 });
  }
  update(): Promise<Row> {
    return Promise.resolve({ id: 1 });
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
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

@PanelResource({ model: "Post", slug: "closed" })
class ClosedResource {
  readonly can = { create: () => false, edit: () => false, view: () => false };
  form(): Schema {
    return Schema.make([
      Select.make("authorId").relationship("author", "name").searchable(),
    ]);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("title"),
      Select.make("authorId").relationship("author", "name").searchable(),
      Select.make("quietId").relationship("author", "name"),
      Select.make("lockedId").relationship("author", "name").searchable().disabled(),
      Select.make("hiddenId")
        .relationship("author", "name")
        .searchable()
        .visible(({ get }) => get("title") === "open"),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-opt-"));
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

beforeEach(async () => {
  queries = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource, ClosedResource],
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterEach(async () => {
  await app.close();
});

async function ask(
  body: unknown,
  slug = "posts",
): Promise<{ status: number; answer: OptionsAnswer }> {
  const response = await fetch(`${url}/admin/api/${slug}/options`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    answer: response.ok ? ((await response.json()) as OptionsAnswer) : { options: [] },
  };
}

const base = { state: {}, operation: "create" as const };

describe("searching a relationship select", () => {
  it("answers with what matched, not with the window", async () => {
    // Three authors exist and one carries "al", so an unfiltered answer and a
    // filtered one cannot be confused here.
    const { status, answer } = await ask({ ...base, path: "authorId", term: "al" });

    expect(status).toBe(200);
    expect(answer.options).toEqual([{ value: 9, label: "Alan" }]);
  });

  it("searches the label field and nothing else", async () => {
    await ask({ ...base, path: "authorId", term: "ada" });

    expect(queries.at(-1)?.search).toEqual({ term: "ada", paths: ["name"] });
  });

  it("caps what a search can return, like any other list", async () => {
    await ask({ ...base, path: "authorId", term: "a" });

    expect(queries.at(-1)?.take).toBe(50);
  });

  it("gives the window back when the box is cleared", async () => {
    const { answer } = await ask({ ...base, path: "authorId", term: "   " });

    expect(queries.at(-1)?.search).toBeUndefined();
    expect(answer.options).toHaveLength(3);
  });

  it("caps the term rather than passing on whatever arrived", async () => {
    await ask({ ...base, path: "authorId", term: "a".repeat(500) });

    expect(queries.at(-1)?.search?.term).toHaveLength(200);
  });
});

describe("what it refuses, in silence", () => {
  it("a field that never said it could be searched", async () => {
    const { status, answer } = await ask({ ...base, path: "quietId", term: "a" });

    expect(status).toBe(200);
    expect(answer.options).toEqual([]);
  });

  // A searchable select with no relationship is refused at boot now, so the
  // route's own guard against one cannot be reached from a running panel. It
  // stays because the route does not get to assume the audit ran; the case is
  // covered where it is now reachable, in the audit's own tests.

  it("a field the form disabled", async () => {
    const { answer } = await ask({ ...base, path: "lockedId", term: "a" });

    expect(answer.options).toEqual([]);
  });

  it("a field the resolution left invisible", async () => {
    const { answer } = await ask({ ...base, path: "hiddenId", term: "a" });

    expect(answer.options).toEqual([]);
  });

  it("but answers for that same field once it is visible", async () => {
    // The refusal above has to be about visibility, not about the field being
    // unreachable in every state — otherwise it proves nothing.
    const { answer } = await ask({
      state: { title: "open" },
      operation: "create",
      path: "hiddenId",
      term: "ada",
    });

    expect(answer.options).toEqual([{ value: 2, label: "Ada" }]);
  });

  it("a path no field carries", async () => {
    const { answer } = await ask({ ...base, path: "nothing", term: "a" });

    expect(answer.options).toEqual([]);
  });

  it("and never says which of those it was", async () => {
    const refusals = await Promise.all(
      ["quietId", "lockedId", "hiddenId", "nothing"].map((path) =>
        ask({ ...base, path, term: "a" }),
      ),
    );

    expect(refusals.map((r) => JSON.stringify(r))).toEqual(
      refusals.map(() => JSON.stringify({ status: 200, answer: { options: [] } })),
    );
  });
});

describe("what one keystroke costs", () => {
  it("is one query, not one per relationship select on the form", async () => {
    // The tree is resolved to read visibility, never to read options. Handing
    // it a loader would fill the window of every relationship select and throw
    // them all away — three of them here, on every letter typed.
    await ask({ ...base, path: "authorId", term: "al" });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.search).toEqual({ term: "al", paths: ["name"] });
  });
});

describe("who is asking", () => {
  it("is refused when the principal may not reach the resource", async () => {
    // The same shape as any other absent resource: a searchable field behind a
    // closed door must not answer differently from one that is not there.
    const { status } = await ask({ ...base, path: "authorId", term: "al" }, "closed");

    expect(status).toBe(404);
  });
});

describe("a search whose results exclude the current value", () => {
  it("does not put it back at the top", async () => {
    // Off a form, the value being edited is kept on the list even when the cap
    // left it out. A search is a different question: topping the results up
    // with a value that did not match would call the reader's own choice a hit.
    const { answer } = await ask({
      state: { authorId: 7 },
      operation: "create",
      path: "authorId",
      term: "al",
    });

    expect(answer.options).toEqual([{ value: 9, label: "Alan" }]);
  });
});

describe("the envelope", () => {
  it("refuses a body that is not an object", async () => {
    expect((await ask([1, 2, 3])).status).toBe(404);
  });

  it("refuses a state that is not an object", async () => {
    expect(
      (await ask({ state: "forged", operation: "create", path: "a", term: "b" }))
        .status,
    ).toBe(404);
  });

  it("refuses a term that is not text", async () => {
    expect((await ask({ ...base, path: "authorId", term: 7 })).status).toBe(404);
  });

  it("refuses an operation nothing declares", async () => {
    expect(
      (await ask({ state: {}, operation: "destroy", path: "authorId", term: "a" }))
        .status,
    ).toBe(404);
  });

  it("refuses a resource that is not there", async () => {
    expect((await ask({ ...base, path: "authorId", term: "a" }, "ghosts")).status).toBe(
      404,
    );
  });
});
