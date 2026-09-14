/**
 * What a key-value entry sends, out of a column nobody here designed.
 *
 * The reading is the whole of it. A `Json` column is where a panel meets a
 * shape it did not choose, and every decision about what counts as a row is
 * made here so that no browser has to make it twice.
 */
import { describe, expect, it } from "vitest";
import { KeyValueEntry } from "./key-value-entry.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";

const drawn = async (entry: KeyValueEntry, record: Record<string, unknown>) =>
  serialise(
    await resolveSchema(Schema.make([entry]), {}, { operation: "edit", record }),
  ).schema.children?.[0];

const settings = KeyValueEntry.make("settings");

describe("a Json column of pairs", () => {
  it("crosses as rows, read on the server", async () => {
    const node = await drawn(settings, { settings: { theme: "dark", locale: "fr" } });

    expect(node?.pairs).toEqual([
      ["theme", "dark"],
      ["locale", "fr"],
    ]);
  });

  it("does not also send the object the rows were read from", async () => {
    // The same data twice, and a browser handed both would have to choose.
    const node = await drawn(settings, { settings: { theme: "dark" } });

    expect(node?.value).toBeUndefined();
  });

  it("shows what is not text as the JSON it is, rather than dropping it", async () => {
    const node = await drawn(settings, {
      settings: { retries: 3, live: true, tags: ["a"] },
    });

    expect(node?.pairs).toEqual([
      ["retries", "3"],
      ["live", "true"],
      ["tags", '["a"]'],
    ]);
  });

  it("reads a key the space around it was hiding", async () => {
    const node = await drawn(settings, { settings: { "  theme  ": "dark" } });

    expect(node?.pairs).toEqual([["theme", "dark"]]);
  });

  it("leaves out a key nobody could read, and a name already taken", async () => {
    const node = await drawn(settings, {
      settings: { "   ": "lost", theme: "dark", " theme ": "again" },
    });

    expect(node?.pairs).toEqual([["theme", "dark"]]);
  });

  it("sends no rows at all for a column holding something that is not an object", async () => {
    // Told apart from an empty one by the value, which is still there.
    for (const held of [[1, 2], "plain", 7]) {
      const node = await drawn(settings, { settings: held });
      expect(node?.pairs).toBeUndefined();
      expect(node?.value).toEqual(held);
    }
  });

  it("sends an empty list for an object holding nothing", async () => {
    const node = await drawn(settings, { settings: {} });

    expect(node?.pairs).toEqual([]);
  });
});

describe("what the columns are called", () => {
  it("is nothing unless the entry said so", async () => {
    const node = await drawn(settings, { settings: { a: "b" } });

    expect(node?.props?.["keyLabel"]).toBeUndefined();
    expect(node?.props?.["valueLabel"]).toBeUndefined();
  });

  it("crosses where it was declared", async () => {
    const node = await drawn(
      KeyValueEntry.make("settings").keyLabel("Header").valueLabel("Sent"),
      { settings: { a: "b" } },
    );

    expect(node?.props?.["keyLabel"]).toBe("Header");
    expect(node?.props?.["valueLabel"]).toBe("Sent");
  });

  it("is cloned rather than changed, like every other builder", () => {
    const named = settings.keyLabel("Header");

    expect(named).not.toBe(settings);
    expect(settings.state.keyLabel).toBeUndefined();
    expect(named.state.keyLabel).toBe("Header");
  });
});
