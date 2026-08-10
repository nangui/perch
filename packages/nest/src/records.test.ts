/**
 * Listing, at the seam rather than over HTTP.
 *
 * The cases here are the ones a router will not let a request reach: Express
 * declines `//evil.com/...` today, and "today's router" is not a security
 * argument — it is the reason `sameOrigin` was extracted in the first place.
 */
import { describe, expect, it } from "vitest";
import type { DataAdapter, FieldMeta, Ir, ModelMeta, Row } from "@perchjs/core";
import { EditAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import type { RegisteredResource } from "./resource-registry.js";
import { listRecords } from "./records.js";

const key: FieldMeta = {
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

const POST: ModelMeta = {
  name: "Post",
  dbName: "Post",
  primaryKey: key,
  fields: [key],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "title",
};

const ROWS: Row[] = [{ id: 1, title: "Ada" }];

const adapter: DataAdapter = {
  ir: (): Ir => ({ models: [POST] }),
  meta: (): ModelMeta => POST,
  findMany: () => Promise.resolve({ rows: ROWS, total: 1 }),
  findOne: () => Promise.resolve(null),
  create: () => Promise.reject(new Error("not needed")),
  update: () => Promise.reject(new Error("not needed")),
  delete: () => Promise.reject(new Error("not needed")),
  transaction: <T>(fn: (tx: DataAdapter) => Promise<T>) => fn(adapter),
};

const resource: RegisteredResource = {
  metadata: {
    model: "Post",
    slug: "posts",
    label: "Post",
    pluralLabel: "Posts",
  },
  instance: {
    form: () => Schema.make([TextInput.make("title")]),
    table: () =>
      Table.make()
        .columns([TextColumn.make("title")])
        .actions([EditAction.make()]),
  },
};

const list = (root: string) => listRecords(adapter, resource, {}, undefined, root);

describe("where a row action points", () => {
  it("is under the root the request came through", async () => {
    expect((await list("/admin")).editPath).toBe("/admin/posts");
    expect((await list("/api/v1/admin")).editPath).toBe("/api/v1/admin/posts");
  });

  it("says nothing when the root is not one this origin owns", async () => {
    // `//evil.com/admin` builds a protocol-relative link: clicking Edit leaves
    // the site. The same guard the redirect after a create already uses.
    expect((await list("//evil.com/admin")).editPath).toBeUndefined();
    expect((await list("https://evil.com/admin")).editPath).toBeUndefined();
  });

  it("names the model's own key rather than assuming one", async () => {
    expect((await list("/admin")).recordKey).toBe("id");
  });
});
