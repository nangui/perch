import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { Placeholder } from "./placeholder.js";
import { TextInput } from "./text-input.js";

const SCHEMA = Schema.make([
  TextInput.make("price"),
  Placeholder.make("withTax").content(
    ({ get }) => `${String(Number(get("price") ?? 0) * 1.2)} inc. tax`,
  ),
]);

const resolve = (state: Record<string, unknown> = {}) =>
  resolveSchema(SCHEMA, state, { operation: "create" });

const shown = async (state: Record<string, unknown>) =>
  serialise(await resolve(state)).schema.children?.[1]?.content;

describe("what it shows", () => {
  it("is computed on the server", async () => {
    expect(await shown({ price: 100 })).toBe("120 inc. tax");
  });

  it("is recomputed when the field it reads changes", async () => {
    // Not hydrated once: `default()` fills a blank a single time, and a line
    // that tracks another field has to follow it.
    expect(await shown({ price: 50 })).toBe("60 inc. tax");
  });

  it("follows the field on a patch, not only on a first load", async () => {
    const first = await resolve({ price: 100 });
    const next = await resolveSchema(
      SCHEMA,
      { price: 200 },
      { operation: "create", dirtyPath: "price", previous: first },
    );

    expect(serialise(next).schema.children?.[1]?.content).toBe("240 inc. tax");
  });
});

describe("what it saves", () => {
  it("nothing at all", async () => {
    expect(
      dehydrate(await resolve({ price: 100 }), { operation: "create" }).set,
    ).toEqual({
      price: 100,
    });
  });
});

describe("what a client may set on it", () => {
  it("nothing: it is a reading, not a control", async () => {
    const clean = sanitize(await resolve({ price: 100 }), {
      withTax: "free, actually",
    });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "withTax", reason: "server-owned" }]);
  });
});

describe("with nothing to say", () => {
  it("resolves without content rather than inventing some", async () => {
    const bare = Schema.make([Placeholder.make("note")]);
    const payload = serialise(await resolveSchema(bare, {}, { operation: "create" }));

    expect(payload.schema.children?.[0]).not.toHaveProperty("content");
  });
});

describe("even when something put a value in its state", () => {
  it("still writes nothing", async () => {
    // A reading is not a column. `default()` fills a blank, and without the
    // field saying it is not dehydrated that filled blank would be written.
    const defaulted = Schema.make([Placeholder.make("note").default("filled")]);
    const settled = await resolveSchema(defaulted, {}, { operation: "create" });

    expect(settled.state["note"]).toBe("filled");
    expect(dehydrate(settled, { operation: "create" }).set).toEqual({});
  });
});
