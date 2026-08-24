/**
 * What a flavour promises, kept on the server.
 *
 * `.email()` and the rest chose the control a browser draws, and that was the
 * whole enforcement: `input[type=email]` refuses what a person types into it
 * and refuses nothing else. Anything reaching the field another way — a forged
 * state, a cell in a table — wrote `not-an-address` into the column the form
 * said held an address.
 */
import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { TextInput } from "./text-input.js";

const saving = async (field: TextInput, value: unknown) => {
  const tree = await resolveSchema(
    Schema.make([field]),
    { at: value },
    { operation: "create" },
  );
  return tree.errors["at"];
};

describe("an address", () => {
  const field = TextInput.make("at").email();

  it("is accepted", async () => {
    expect(await saving(field, "ada@example.com")).toBeUndefined();
    expect(await saving(field, "ada+notes@sub.example.co.uk")).toBeUndefined();
  });

  it("is refused where it is not one", async () => {
    expect(await saving(field, "ada")).toBe("Must be an email address.");
    expect(await saving(field, "ada@example")).toBe("Must be an email address.");
    expect(await saving(field, "ada @example.com")).toBe("Must be an email address.");
  });

  it("is judged loosely on purpose", async () => {
    // No expression matches every address and no other. A form that turns away
    // a valid one is worse than a column with a curious value in it: one is a
    // bug the reader cannot get past, the other is a row somebody fixes.
    expect(await saving(field, "ada@example.museum")).toBeUndefined();
    expect(await saving(field, "o'hara@example.com")).toBeUndefined();
  });
});

describe("a link", () => {
  const field = TextInput.make("at").url();

  it("is accepted where a browser would follow it", async () => {
    expect(await saving(field, "https://example.com/ada")).toBeUndefined();
    expect(await saving(field, "http://example.com")).toBeUndefined();
  });

  it("is refused where it is not one, or goes somewhere else", async () => {
    expect(await saving(field, "example.com")).toBe("Must be a link.");
    expect(await saving(field, "javascript:alert(1)")).toBe("Must be a link.");
  });
});

describe("a number", () => {
  const field = TextInput.make("at").numeric();

  it("is accepted, in either shape the wire carries", async () => {
    expect(await saving(field, "12")).toBeUndefined();
    expect(await saving(field, "12.5")).toBeUndefined();
    expect(await saving(field, 12)).toBeUndefined();
  });

  it("is refused where it is words", async () => {
    expect(await saving(field, "abc")).toBe("Must be a number.");
    expect(await saving(field, "12 apples")).toBe("Must be a number.");
  });
});

describe("what the rules stay out of", () => {
  it("a field that declared no flavour", async () => {
    expect(await saving(TextInput.make("at"), "anything at all")).toBeUndefined();
  });

  it("a blank, which is what `required` is for", async () => {
    // Two complaints about one empty box is one complaint too many, and the
    // one that names the real problem is `required`.
    expect(await saving(TextInput.make("at").email(), "")).toBeUndefined();
    expect(await saving(TextInput.make("at").numeric(), "   ")).toBeUndefined();
  });

  it("a value that is not text, which `admits` has already had its say on", async () => {
    expect(await saving(TextInput.make("at").email(), 12)).toBeUndefined();
  });
});
