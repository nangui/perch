/**
 * A to-many relation, read.
 *
 * The one thing that matters: each row's entries read *that* row. An entry in
 * a form's repeater reads the record instead, which is why the boot refuses one
 * and why this is a different component rather than a flag on that one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../component.js";
import { Schema, Section } from "../layout.js";
import { RepeatableEntry } from "./repeatable-entry.js";
import { TextEntry } from "./text-entry.js";
import { entryPaths, entryRelations } from "../entry-paths.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";

const RECORD = {
  id: 1,
  title: "Ada",
  notes: [
    { id: 10, body: "First", author: { name: "Grace" } },
    { id: 11, body: "Second", author: { name: "Alan" } },
  ],
};

const NOTES = () =>
  RepeatableEntry.make("notes").schema([
    TextEntry.make("body").label("Note"),
    TextEntry.make("author.name").label("By"),
  ]);

const drawn = async (schema: ReturnType<typeof Schema.make>) =>
  serialise(await resolveSchema(schema, {}, { operation: "view", record: RECORD }));

describe("the rows a relation carried", () => {
  it("each become a group of their own", async () => {
    const payload = await drawn(Schema.make([NOTES()]));
    const repeatable = payload.schema.children?.[0];

    expect(repeatable?.type).toBe("RepeatableEntry");
    expect(repeatable?.children?.length).toBe(2);
  });

  it("read their own row rather than the record that holds them", async () => {
    // The whole point. Before this, an entry inside anything repeated resolved
    // against the record and showed the same value on every row.
    const rows = (await drawn(Schema.make([NOTES()]))).schema.children?.[0]?.children;

    expect(rows?.map((row) => row.children?.[0]?.value)).toEqual(["First", "Second"]);
  });

  it("reach through a relation of their own row", async () => {
    const rows = (await drawn(Schema.make([NOTES()]))).schema.children?.[0]?.children;

    expect(rows?.map((row) => row.children?.[1]?.value)).toEqual(["Grace", "Alan"]);
  });

  it("are none where the record carried none, rather than one empty one", async () => {
    const payload = serialise(
      await resolveSchema(
        Schema.make([NOTES()]),
        {},
        {
          operation: "view",
          record: { id: 1 },
        },
      ),
    );

    expect(payload.schema.children?.[0]?.children ?? []).toEqual([]);
  });

  it("put nothing in the state map, like every other entry", async () => {
    expect((await drawn(Schema.make([NOTES()]))).state).toEqual({});
  });
});

describe("what drawing the rows costs", () => {
  afterEach(() => {
    Component.resetConfigurators();
  });

  it("shapes a row once, however many rows the record carried", async () => {
    // `Schema.make` runs every configurator registered against it. Built inside
    // the loop, a page of twenty notes ran them twenty times to produce twenty
    // identical objects.
    let built = 0;
    Schema.configureUsing((schema) => {
      built += 1;
      return schema;
    });

    await resolveSchema(
      Schema.make([NOTES()]),
      {},
      { operation: "view", record: RECORD },
    );

    // One for the form's own root, one for the shape a row takes.
    expect(built).toBe(2);
  });
});

describe("what the loading plan is told", () => {
  it("counts the relation once, with what its rows read", () => {
    const schema = Schema.make([TextEntry.make("title"), NOTES()]);

    expect(entryRelations(schema)).toEqual([
      { relation: "notes", paths: ["body", "author.name"], relations: [] },
    ]);
  });

  it("keeps a row's paths out of the record's own", () => {
    // `body` is a column on a note, not on the record. Checked against the
    // record's model it would refuse a form that is right.
    expect(entryPaths(Schema.make([TextEntry.make("title"), NOTES()]))).toEqual([
      "title",
    ]);
  });

  it("follows a relation a row holds, as deep as it goes", () => {
    // The resolution has always handled this — a row is walked against itself.
    // A plan that stopped at the first level would leave the inner one asking a
    // database nobody told to load it, which draws as an empty section on a
    // page that otherwise looks right.
    const schema = Schema.make([
      RepeatableEntry.make("notes").schema([
        TextEntry.make("body"),
        RepeatableEntry.make("tags").schema([TextEntry.make("name")]),
      ]),
    ]);

    expect(entryRelations(schema)).toEqual([
      {
        relation: "notes",
        paths: ["body"],
        relations: [{ relation: "tags", paths: ["name"], relations: [] }],
      },
    ]);
  });

  it("finds one nested in a layout, where it would actually be", () => {
    const schema = Schema.make([Section.make("Notes").schema([NOTES()])]);

    expect(entryRelations(schema).map((r) => r.relation)).toEqual(["notes"]);
  });
});

describe("what identifies an entry inside a row", () => {
  it("tells one row's keyed entry from the next one's", async () => {
    // Every row is drawn from the same declaration, so a key written once was
    // the id of every row's copy — and the renderer keys React by it, which
    // makes two siblings under one key.
    const payload = await drawn(
      Schema.make([
        RepeatableEntry.make("notes").schema([
          TextEntry.make("body").label("Note").key("theBody"),
        ]),
      ]),
    );

    const rows = payload.schema.children?.[0]?.children ?? [];
    const ids = rows.flatMap((row) => (row.children ?? []).map((one) => one.id));

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
