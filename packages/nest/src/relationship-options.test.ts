import { describe, expect, it, vi } from "vitest";
import type { DataAdapter, Ir, Query, Row } from "@perchjs/core";
import { Schema, Select, resolveSchema, serialise } from "@perchjs/core";
import { optionLoader, withOptions } from "./relationship-options.js";

const IR: Ir = {
  models: [
    {
      name: "Post",
      fields: [
        { name: "id", kind: "scalar", type: "Int", isId: true, isRequired: true },
        { name: "authorId", kind: "scalar", type: "Int", isRequired: true },
      ],
      relations: [
        {
          name: "author",
          type: "many-to-one",
          targetModel: "Author",
          foreignKeyFields: ["authorId"],
          referencedFields: ["id"],
          isRequired: true,
          isList: false,
        },
      ],
      primaryKey: "id",
      hasSoftDelete: false,
    },
    {
      name: "Author",
      fields: [
        { name: "id", kind: "scalar", type: "Int", isId: true, isRequired: true },
        { name: "name", kind: "scalar", type: "String", isRequired: true },
        { name: "profile", kind: "scalar", type: "Json", isRequired: false },
      ],
      relations: [],
      primaryKey: "id",
      hasSoftDelete: false,
    },
  ],
} as unknown as Ir;

function adapterOf(rows: readonly Row[]): {
  data: DataAdapter;
  queries: Query[];
} {
  const queries: Query[] = [];
  const data = {
    ir: () => IR,
    findMany: (query: Query) => {
      queries.push(query);
      return Promise.resolve({ rows, total: rows.length });
    },
  } as unknown as DataAdapter;
  return { data, queries };
}

describe("loading the options a relationship declares", () => {
  it("lists the target rows, by key and label", async () => {
    const { data } = adapterOf([
      { id: 2, name: "Ada" },
      { id: 7, name: "Grace" },
    ]);

    const load = optionLoader(data, "Post");
    const options = await load?.({
      relationship: { name: "author", labelField: "name" },
      limit: 50,
    });

    expect(options).toEqual([
      { value: 2, label: "Ada" },
      { value: 7, label: "Grace" },
    ]);
  });

  it("asks for no more than the declared limit, in label order", async () => {
    const { data, queries } = adapterOf([]);

    await optionLoader(
      data,
      "Post",
    )?.({
      relationship: { name: "author", labelField: "name" },
      limit: 12,
    });

    expect(queries).toEqual([
      { model: "Author", take: 12, sort: [{ path: "name", direction: "asc" }] },
    ]);
  });

  it("asks once however many times it is asked", async () => {
    const { data, queries } = adapterOf([{ id: 1, name: "Ada" }]);
    const load = optionLoader(data, "Post");
    const request = { relationship: { name: "author", labelField: "name" }, limit: 50 };

    await Promise.all([load?.(request), load?.(request), load?.(request)]);

    expect(queries).toHaveLength(1);
  });

  it("names a relation the model does not declare", async () => {
    const { data } = adapterOf([]);

    await expect(
      optionLoader(
        data,
        "Post",
      )?.({
        relationship: { name: "editor", labelField: "name" },
        limit: 50,
      }),
    ).rejects.toThrow("declares no relation `editor`");
  });

  it("names a label field the target does not have, before querying", async () => {
    const { data, queries } = adapterOf([]);

    await expect(
      optionLoader(
        data,
        "Post",
      )?.({
        relationship: { name: "author", labelField: "fullName" },
        limit: 50,
      }),
    ).rejects.toThrow("has no field `fullName`");
    expect(queries).toEqual([]);
  });

  it("refuses a label that is not text rather than printing an object", async () => {
    const { data } = adapterOf([{ id: 1, profile: { bio: "…" } }]);

    await expect(
      optionLoader(
        data,
        "Post",
      )?.({
        relationship: { name: "author", labelField: "profile" },
        limit: 50,
      }),
    ).rejects.toThrow("holds no text");
  });

  it("falls back to the key when a row has no label", async () => {
    const { data } = adapterOf([{ id: 4, name: null }]);

    const options = await optionLoader(
      data,
      "Post",
    )?.({
      relationship: { name: "author", labelField: "name" },
      limit: 50,
    });

    expect(options).toEqual([{ value: 4, label: "4" }]);
  });

  it("is nothing at all without an adapter", () => {
    expect(withOptions(null, "Post")).toEqual({});
  });
});

describe("a form declaring one", () => {
  it("reaches the renderer with its options filled", async () => {
    const { data } = adapterOf([{ id: 2, name: "Ada" }]);
    const schema = Schema.make([
      Select.make("authorId").relationship("author", "name"),
    ]);

    const resolved = await resolveSchema(
      schema,
      {},
      { operation: "create", ...withOptions(data, "Post") },
    );

    expect(serialise(resolved).schema.children?.[0]).toMatchObject({
      options: [{ value: 2, label: "Ada" }],
    });
  });

  it("prefers a declared list, and spends no query on the relation", async () => {
    const { data, queries } = adapterOf([{ id: 2, name: "Ada" }]);
    const schema = Schema.make([
      Select.make("authorId")
        .relationship("author", "name")
        .options({ "1": "Written by hand" }),
    ]);

    const resolved = await resolveSchema(
      schema,
      {},
      { operation: "create", ...withOptions(data, "Post") },
    );

    expect(serialise(resolved).schema.children?.[0]).toMatchObject({
      options: [{ value: "1", label: "Written by hand" }],
    });
    expect(queries).toEqual([]);
  });

  it("caps what it loads at the declared limit", async () => {
    const { data, queries } = adapterOf([]);
    const schema = Schema.make([
      Select.make("authorId").relationship("author", "name").optionsLimit(5),
    ]);

    await resolveSchema(
      schema,
      {},
      { operation: "create", ...withOptions(data, "Post") },
    );

    expect(queries[0]?.take).toBe(5);
  });

  it("issues one query per relationship field, not one per pass", async () => {
    const { data, queries } = adapterOf([{ id: 2, name: "Ada" }]);
    const schema = Schema.make([
      Select.make("authorId").relationship("author", "name"),
      Select.make("reviewerId").relationship("author", "name"),
    ]);

    await resolveSchema(
      schema,
      {},
      { operation: "create", ...withOptions(data, "Post") },
    );

    expect(queries).toHaveLength(1);
  });
});

describe("a select with no adapter behind it", () => {
  it("resolves without options rather than throwing", async () => {
    const schema = Schema.make([
      Select.make("authorId").relationship("author", "name"),
    ]);

    const resolved = await resolveSchema(schema, {}, { operation: "create" });

    expect(serialise(resolved).schema.children?.[0]).not.toHaveProperty("options");
  });
});

describe("the loader the controllers build", () => {
  it("is one memo per request, never shared between them", async () => {
    const { data, queries } = adapterOf([{ id: 1, name: "Ada" }]);
    const request = { relationship: { name: "author", labelField: "name" }, limit: 50 };

    await withOptions(data, "Post").loadOptions?.(request);
    await withOptions(data, "Post").loadOptions?.(request);

    expect(queries).toHaveLength(2);
  });
});

describe("a relation a select cannot carry", () => {
  it("names a composite key rather than picking one of its fields", async () => {
    const composite = {
      models: [
        {
          name: "Post",
          fields: [],
          relations: [
            {
              name: "author",
              type: "many-to-one",
              targetModel: "Author",
              foreignKeyFields: ["a", "b"],
              referencedFields: ["a", "b"],
              isRequired: true,
              isList: false,
            },
          ],
          primaryKey: "id",
          hasSoftDelete: false,
        },
      ],
    } as unknown as Ir;
    const data = {
      ir: () => composite,
      findMany: vi.fn(),
    } as unknown as DataAdapter;

    await expect(
      optionLoader(
        data,
        "Post",
      )?.({
        relationship: { name: "author", labelField: "name" },
        limit: 50,
      }),
    ).rejects.toThrow("a select carries one value");
  });
});
