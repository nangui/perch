/**
 * The helpers, driving a panel that is really running.
 *
 * The point of this file is that none of it is a mock. A panel is booted, its
 * routes answer, and every assertion below is made against what came back
 * over the wire — so a helper that quietly agreed with itself would fail here
 * the way it would fail for somebody testing their own panel.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Injectable, Module } from "@nestjs/common";
import type {
  DataAdapter,
  FieldMeta,
  Id,
  Ir,
  ModelMeta,
  Row,
  WriteTree,
} from "@perchjs/core";
import { Schema, Select, TextInput } from "@perchjs/core";
import type { PanelAssets } from "@perchjs/nest";
import { PanelModule, PanelResource } from "@perchjs/nest";
import { afterEach, describe, expect, it } from "vitest";
import { createPanelTest } from "./harness.js";
import type { PanelTest } from "./harness.js";

const CITIES: Record<string, Record<string, string>> = {
  fr: { paris: "Paris", lyon: "Lyon" },
  be: { brussels: "Brussels" },
};

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

const written: Row[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    // Holding the model `meta` describes. The two disagreeing is a double
    // contradicting itself, and the boot refuses it.
    return { models: [this.meta()] };
  }
  meta(): ModelMeta {
    // Written out rather than cast: the panel reads the primary key to look a
    // row up by, and a shape that only satisfies the compiler answers 500 at
    // the first request.
    return {
      name: "Person",
      dbName: "Person",
      primaryKey: KEY,
      fields: [KEY, text("email"), text("countryId"), text("cityId")],
      relations: [],
      uniqueConstraints: [],
      hasSoftDelete: false,
      labelField: "id",
    };
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: written, total: written.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(written.find((row) => row["id"] === id) ?? null);
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    // The columns live under `set`: what the panel hands over is a write tree,
    // not a row, because one save can write a row and its children.
    const row = { id: written.length + 1, ...(data.set ?? {}) };
    written.push(row);
    return Promise.resolve(row);
  }
  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    const row = {
      ...(written.find((one) => one["id"] === id) ?? {}),
      ...(data.set ?? {}),
    };
    return Promise.resolve(row);
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
  can = {
    viewAny: (user: unknown) =>
      (user as { role?: string } | undefined)?.role === "admin",
  };
  form(): Schema {
    return Schema.make([
      TextInput.make("email").required(),
      Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
      Select.make("cityId")
        .options(({ get }) => CITIES[String(get("countryId"))] ?? {})
        .visible(({ get }) => Boolean(get("countryId"))),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-testing-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: MemoryAdapter,
      assets: assets(),
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class AdminModule {}

const admin = { role: "admin" };
const guest = { role: "guest" };

let panel: PanelTest | undefined;

afterEach(async () => {
  await panel?.close();
  panel = undefined;
  written.length = 0;
});

const boot = async (): Promise<PanelTest> => {
  panel = await createPanelTest({ module: AdminModule, as: admin });
  return panel;
};

describe("a form, driven", () => {
  it("reads the fields the panel drew", async () => {
    await (await boot()).resource(PersonResource).form().assertHasField("email");
  });

  it("says what a field the panel did not draw would be", async () => {
    // The message is the helper's whole job on a failure: a test that says
    // only "false is not true" sends somebody reading the framework.
    await expect(
      (await boot()).resource(PersonResource).form().assertHasField("nickname"),
    ).rejects.toThrow(/have a field at "nickname".*email, countryId/s);
  });

  it("takes back what the server made of what was filled in", async () => {
    // The dependent field is absent until the one it depends on is answered,
    // and the helper never decided that — the round trip did.
    await (
      await boot()
    )
      .resource(PersonResource)
      .form()
      .assertFieldHidden("cityId")
      .fill({ countryId: "fr" })
      .assertFieldVisible("cityId");
  });

  it("reads the options the server resolved, for the value that was filled in", async () => {
    await (
      await boot()
    )
      .resource(PersonResource)
      .form()
      .fill({ countryId: "fr" })
      .assertFieldOptions("cityId", ["Paris", "Lyon"])
      .fill({ countryId: "be" })
      .assertFieldOptions("cityId", ["Brussels"]);
  });

  it("writes a row, and reads back what was written", async () => {
    await (
      await boot()
    )
      .resource(PersonResource)
      .form()
      .fill({ email: "ada@example.com", countryId: "fr" })
      .fill({ cityId: "paris" })
      .submit()
      .assertNoErrors()
      .assertRecordCreated({ email: "ada@example.com", cityId: "paris" });

    expect(written).toHaveLength(1);
  });

  it("catches a refusal rather than reporting a write that never happened", async () => {
    await (
      await boot()
    )
      .resource(PersonResource)
      .form()
      .fill({ countryId: "fr" })
      .submit()
      .assertHasError("email");

    expect(written).toEqual([]);
  });

  it("says so where a test asserts a row that was never written", async () => {
    await expect(
      (await boot())
        .resource(PersonResource)
        .form()
        .submit()
        .assertRecordCreated({ email: "ada@example.com" }),
    ).rejects.toThrow(/wrote no record/);
  });
});

describe("the chain", () => {
  it("runs once, however many times it is awaited", async () => {
    // A chain ending in a submit, run twice, writes twice.
    const chain = (await boot())
      .resource(PersonResource)
      .form()
      .fill({ email: "ada@example.com" })
      .submit();

    await chain;
    await chain;

    expect(written).toHaveLength(1);
  });

  it("runs its steps in the order they were written", async () => {
    // Asserting the dependent field before filling its parent has to fail:
    // the order is the whole meaning of the sentence.
    await expect(
      (await boot())
        .resource(PersonResource)
        .form()
        .assertFieldVisible("cityId")
        .fill({ countryId: "fr" }),
    ).rejects.toThrow(/Expected "cityId" to be visible/);
  });
});

describe("who is asking", () => {
  it("is the reader the panel was booted as", async () => {
    await (await boot()).resource(PersonResource).assertAllowed();
  });

  it("changes without changing the panel under the other chains", async () => {
    // `as` mints a facade rather than setting a current user: two chains in
    // flight must not read each other's principal.
    const booted = await boot();
    const asGuest = booted.as(guest);

    await Promise.all([
      booted.resource(PersonResource).assertAllowed(),
      asGuest.resource(PersonResource).assertForbidden(),
    ]);
  });

  it("carries into the form, not only into the door", async () => {
    await expect(
      (await boot()).as(guest).resource(PersonResource).form().assertHasField("email"),
    ).rejects.toThrow(/answered 404/);
  });
});

describe("what a test names", () => {
  it("is the class, and a class that is not a resource says so", async () => {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- the point is that it carries nothing
    class NotAResource {}
    const booted = await boot();

    expect(() => booted.resource(NotAResource)).toThrow(/carries no @PanelResource/);
  });
});
