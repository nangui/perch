/**
 * The ways this harness could lie, kept shut.
 *
 * A testing library has one failure that matters more than any other: a green
 * test over a panel that is broken. Somebody reads that green and ships. Every
 * case here was a real hole found by attacking the helpers rather than by
 * using them, and each one made a test pass that should not have.
 */
import { Injectable, Module } from "@nestjs/common";
import type { DataAdapter, FieldMeta, Ir, ModelMeta, Row } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import type { PanelAssets } from "@perchjs/nest";
import { PanelModule, PanelResource } from "@perchjs/nest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createPanelTest } from "./harness.js";
import type { PanelTest } from "./harness.js";

const text = (name: string): FieldMeta => ({
  name,
  kind: "scalar",
  type: "String",
  isRequired: false,
  isList: false,
  isId: false,
  isUnique: false,
  isReadOnly: false,
  hasDefault: false,
  isLongText: false,
});

const KEY: FieldMeta = {
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

/** An adapter that answers every write the way a database having a bad day does. */
@Injectable()
class Exploding implements DataAdapter {
  ir(): Ir {
    return { models: [this.meta()] };
  }
  meta(): ModelMeta {
    return {
      name: "Person",
      dbName: "Person",
      primaryKey: KEY,
      fields: [KEY, text("email")],
      relations: [],
      uniqueConstraints: [],
      hasSoftDelete: false,
      labelField: "id",
    };
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: [], total: 0 });
  }
  findOne(): Promise<Row | null> {
    return Promise.resolve(null);
  }
  create(): Promise<Row> {
    throw new Error("the database said no");
  }
  update(): Promise<Row> {
    throw new Error("the database said no");
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  forceDelete(): Promise<number> {
    return Promise.resolve(0);
  }
  restore(): Promise<number> {
    return Promise.resolve(0);
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

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([TextInput.make("email")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-lying-"));
  writeFileSync(join(directory, "a.js"), "");
  writeFileSync(join(directory, "a.css"), "");
  return {
    directory,
    entries: { "panel.js": "a.js", "panel.css": "a.css" },
    chunks: [],
  };
}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: Exploding,
      assets: assets(),
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class BreakingModule {}

/** A panel with no adapter: it cannot list, and nobody is forbidden anything. */
@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      assets: assets(),
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class NoAdapterModule {}

@Module({ imports: [] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class NotAPanel {}

let panel: PanelTest | undefined;

afterEach(async () => {
  await panel?.close();
  panel = undefined;
});

describe("a save that never happened", () => {
  it("is not a form without errors", async () => {
    // It answers 500 and names no field, so the tree keeps the errors it had
    // before — which were none. Read as "no errors", a panel that exploded
    // reads as a panel that worked.
    panel = await createPanelTest({ module: BreakingModule });

    await expect(
      panel
        .resource(PersonResource)
        .form()
        .fill({ email: "ada@example.com" })
        .submit()
        .assertNoErrors(),
    ).rejects.toThrow(
      /answered 500.*panel failing rather than the form being refused/s,
    );
  });

  it("is not a field without an error either", async () => {
    panel = await createPanelTest({ module: BreakingModule });

    await expect(
      panel
        .resource(PersonResource)
        .form()
        .fill({ email: "ada@example.com" })
        .submit()
        .assertHasError("email"),
    ).rejects.toThrow(/answered 500/);
  });
});

describe("a chain that failed", () => {
  it("says the same thing however many times it is awaited", async () => {
    // The steps are not run again — one ending in a submit would write twice —
    // but answering the second await with success is the harness disagreeing
    // with itself about what it just saw.
    panel = await createPanelTest({ module: BreakingModule });
    const chain = panel.resource(PersonResource).form().assertHasField("nickname");

    await expect(chain).rejects.toThrow(/have a field at "nickname"/);
    await expect(chain).rejects.toThrow(/have a field at "nickname"/);
  });
});

describe("a refusal that is not about the reader", () => {
  it("is not reported as a permission", async () => {
    // No adapter, so no list page; no policy, so nobody is forbidden anything.
    // One door answering 404 is not a fact about who is asking.
    panel = await createPanelTest({ module: NoAdapterModule });

    await expect(panel.resource(PersonResource).assertForbidden()).rejects.toThrow(
      /refusing for some other reason — a missing data adapter/,
    );
  });

  it("still lets the other door say the reader is in", async () => {
    panel = await createPanelTest({ module: NoAdapterModule });

    await expect(
      panel.resource(PersonResource).assertAllowed(),
    ).resolves.toBeUndefined();
  });
});

describe("a module that holds no panel", () => {
  it("says so, rather than naming a symbol nobody has heard of", async () => {
    await expect(createPanelTest({ module: NotAPanel })).rejects.toThrow(
      /NotAPanel imports no panel/,
    );
  });
});
