/**
 * Listing, at the seam rather than over HTTP.
 *
 * The cases here are the ones a router will not let a request reach: Express
 * declines `//evil.com/...` today, and "today's router" is not a security
 * argument — it is the reason `sameOrigin` was extracted in the first place.
 */
import { describe, expect, it } from "vitest";
import type { DataAdapter, Ir, ModelMeta, Row } from "@perchjs/core";
import { EditAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import type { RegisteredResource } from "./resource-registry.js";
import { listRecords, resourcePath } from "./records.js";
import { model } from "./__fixtures__/ir.js";

const POST = model({ uniqueConstraints: [["id"]] });

const ROWS: Row[] = [{ id: 1, title: "Ada" }];

const adapter: DataAdapter = {
  ir: (): Ir => ({ models: [POST] }),
  meta: (): ModelMeta => POST,
  findMany: () => Promise.resolve({ rows: ROWS, total: 1 }),
  findOne: () => Promise.resolve(null),
  create: () => Promise.reject(new Error("not needed")),
  update: () => Promise.reject(new Error("not needed")),
  delete: () => Promise.reject(new Error("not needed")),
  forceDelete: () => Promise.reject(new Error("not needed")),
  restore: () => Promise.reject(new Error("not needed")),
  attach: () => Promise.reject(new Error("not needed")),
  detach: () => Promise.reject(new Error("not needed")),
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

describe("the path a resource's pages live under", () => {
  it("is the root and the slug", () => {
    expect(resourcePath("/admin", "posts")).toBe("/admin/posts");
  });

  it("is nothing when it would not point at this origin", () => {
    // Used by the row action, the create link and the breadcrumb alike. One
    // function, so the guard cannot be right in one place and missing in
    // another.
    expect(resourcePath("//evil.com/admin", "posts")).toBeUndefined();
    expect(resourcePath("https://evil.com", "posts")).toBeUndefined();
  });
});

describe("where a row action points", () => {
  it("is under the root the request came through", async () => {
    expect((await list("/admin")).resourcePath).toBe("/admin/posts");
    expect((await list("/api/v1/admin")).resourcePath).toBe("/api/v1/admin/posts");
  });

  it("says nothing when the root is not one this origin owns", async () => {
    // `//evil.com/admin` builds a protocol-relative link: clicking Edit leaves
    // the site. The same guard the redirect after a create already uses.
    expect((await list("//evil.com/admin")).resourcePath).toBeUndefined();
    expect((await list("https://evil.com/admin")).resourcePath).toBeUndefined();
  });

  it("names the model's own key rather than assuming one", async () => {
    expect((await list("/admin")).recordKey).toBe("id");
  });
});
