import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";
import { TextInput } from "./text-input.js";
import { Textarea } from "./textarea.js";

const errorsFor = async (field: Textarea | TextInput, value: unknown) =>
  (await resolveSchema(Schema.make([field]), { body: value }, { operation: "create" }))
    .errors["body"];

describe("a declared limit", () => {
  it("is refused on the server, not only counted in the browser", async () => {
    // It crossed the wire as a hint and nothing looked at it again: a forged
    // request put anything it liked in a field declared at 500.
    expect(await errorsFor(Textarea.make("body").maxLength(5), "far too long")).toBe(
      "Must be at most 5 characters.",
    );
  });

  it("lets the limit itself through", async () => {
    expect(
      await errorsFor(Textarea.make("body").maxLength(5), "12345"),
    ).toBeUndefined();
  });

  it("holds for a short one too", async () => {
    expect(await errorsFor(Textarea.make("body").minLength(3), "ab")).toBe(
      "Must be at least 3 characters.",
    );
  });

  it("holds on a single-line field, which had the same gap", async () => {
    expect(await errorsFor(TextInput.make("body").maxLength(2), "abc")).toBe(
      "Must be at most 2 characters.",
    );
  });

  it("counts what the person typing counts", async () => {
    // A family emoji is seven code points and one character. Counting it seven
    // would make the footer disagree with the error under it.
    expect(await errorsFor(Textarea.make("body").maxLength(1), "👨‍👩‍👧")).toBeUndefined();
  });

  it("is replaced by a second declaration rather than joined by it", async () => {
    expect(
      await errorsFor(Textarea.make("body").maxLength(2).maxLength(20), "abcdef"),
    ).toBeUndefined();
  });

  it("says nothing about a value that is not text", async () => {
    // The shape is the boundary's to refuse; a length rule that fired on it
    // would report the wrong problem.
    expect(await errorsFor(Textarea.make("body").maxLength(2), 12345)).toBeUndefined();
  });
});

describe("on the wire", () => {
  it("carries how tall it starts and what it counts to", async () => {
    const result = await resolveSchema(
      Schema.make([Textarea.make("body").rows(6).autosize().maxLength(500)]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.props).toEqual({
      rows: 6,
      autosize: true,
      maxLength: 500,
    });
  });

  it("keeps a minimum to itself, having nobody to tell", async () => {
    // The server holds it. Sending it to a renderer that reads it off nothing
    // is one more declaration crossing a wire and commanding no one.
    const result = await resolveSchema(
      Schema.make([Textarea.make("body").minLength(3)]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.props).toEqual({ autosize: false });
  });

  it("says autosize is off rather than leaving it unsaid", async () => {
    const result = await resolveSchema(
      Schema.make([Textarea.make("body")]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.props).toEqual({ autosize: false });
  });
});
