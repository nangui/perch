/**
 * Static content in a schema, and what tells it from a placeholder.
 *
 * A placeholder is a field: it sits in the field grid with a label above it and
 * is a computed reading of the record. These are the sentence between two
 * sections and the diagram above a form — content, not a reading, and holding
 * no state for anything to admit or write.
 */
import { describe, expect, it } from "vitest";
import { auditInfolist, auditSchema } from "./audit.js";
import { Field } from "./field.js";
import { Schema } from "./layout.js";
import { Icon, Image, Prime, Text } from "./prime.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";
import { serialise } from "./serialise.js";

const drawn = async (
  schema: Schema,
  state: Record<string, unknown> = {},
): Promise<ReturnType<typeof serialise>> =>
  serialise(await resolveSchema(schema, state, { operation: "create" }));

describe("a line of prose between the controls", () => {
  it("says what it was given, in the tone it was given", async () => {
    const payload = await drawn(
      Schema.make([Text.make("Rates apply from Monday.").tone("warning")]),
    );

    expect(payload.schema.children?.[0]?.type).toBe("Text");
    expect(payload.schema.children?.[0]?.content).toBe("Rates apply from Monday.");
    expect(payload.schema.children?.[0]?.props?.["tone"]).toBe("warning");
  });

  it("works its sentence out from what the reader has typed", async () => {
    const payload = await drawn(
      Schema.make([
        TextInput.make("role"),
        Text.make(({ get }) => `You picked ${String(get("role"))}.`),
      ]),
      { role: "lead" },
    );

    expect(payload.schema.children?.[1]?.content).toBe("You picked lead.");
  });
});

describe("a picture", () => {
  it("carries its address and what to say instead of it", async () => {
    const payload = await drawn(Schema.make([Image.make("A rate chart", "/c.png")]));

    expect(payload.schema.children?.[0]?.content).toBe("/c.png");
    expect(payload.schema.children?.[0]?.props?.["alt"]).toBe("A rate chart");
  });

  it("takes an empty alternative, which says it is decoration", async () => {
    // A real answer, and the reason it is asked for on the way in rather than
    // offered afterwards: asked second, it is forgotten.
    const payload = await drawn(Schema.make([Image.make("", "/c.png")]));

    expect(payload.schema.children?.[0]?.props?.["alt"]).toBe("");
  });
});

describe("an address a picture will not be pointed at", () => {
  it("is refused on the server, like an entry's link is", async () => {
    // The source accepts a resolver, so it can be built from a stored value —
    // and a stored value does not reach an attribute unchecked.
    const payload = await drawn(
      Schema.make([Image.make("A chart", "javascript:alert(1)")]),
    );

    expect(payload.schema.children?.[0]?.content).toBeUndefined();
  });

  it("takes a path and an ordinary address", async () => {
    const relative = await drawn(Schema.make([Image.make("A chart", "/c.png")]));
    const absolute = await drawn(
      Schema.make([Image.make("A chart", "https://example.com/c.png")]),
    );

    expect(relative.schema.children?.[0]?.content).toBe("/c.png");
    expect(absolute.schema.children?.[0]?.content).toBe("https://example.com/c.png");
  });

  it("refuses one worked out from a row, the same as one written down", async () => {
    const payload = await drawn(
      Schema.make([
        TextInput.make("url"),
        Image.make("Their avatar", ({ get }) => String(get("url"))),
      ]),
      { url: "javascript:alert(1)" },
    );

    expect(payload.schema.children?.[1]?.content).toBeUndefined();
  });

  it("leaves a paragraph's words alone, which are not an address", async () => {
    const payload = await drawn(Schema.make([Text.make("javascript:alert(1)")]));

    expect(payload.schema.children?.[0]?.content).toBe("javascript:alert(1)");
  });
});

describe("a mark", () => {
  it("is the character it was given", async () => {
    const payload = await drawn(Schema.make([Icon.make("⚑").tone("danger")]));

    expect(payload.schema.children?.[0]?.content).toBe("⚑");
    expect(payload.schema.children?.[0]?.props?.["tone"]).toBe("danger");
  });
});

describe("what a prime is not", () => {
  const all = () =>
    Schema.make([
      Text.make("A line."),
      Image.make("A chart", "/c.png"),
      Icon.make("*"),
    ]);

  it("is not a field, so nothing admits it and nothing writes it", async () => {
    // The three files that must stay boring key on `instanceof Field`. A prime
    // that were one would take part in admission and in the write tree, which
    // is the whole reason it extends `Component` instead.
    expect(Text.make("A line.")).not.toBeInstanceOf(Field);
    expect(Text.make("A line.")).toBeInstanceOf(Prime);

    const tree = await resolveSchema(all(), {}, { operation: "create" });

    expect(sanitize(tree, { "A line.": "typed" }).state).toEqual({});
    expect(dehydrate(tree, { operation: "create", user: undefined }).set).toEqual({});
  });

  it("is at home in a form and in an infolist alike", () => {
    expect(auditSchema(all())).toEqual([]);
    expect(auditInfolist(all())).toEqual([]);
  });
});
