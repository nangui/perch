/**
 * A shape a value is typed in, and what the server makes of it.
 *
 * The mask is the browser's job — it decides what a keystroke looks like. This
 * is the half that decides what may be stored, and it exists because a shape
 * enforced only in a box is a shape a forged request walks straight past.
 *
 * It is deliberately forgiving about punctuation. A column that keeps bare
 * digits, a row written before the mask was added, and a value typed into the
 * box all reach here in different shapes and all mean the same number.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { TextInput } from "./fields/text-input.js";

const errorFor = async (mask: string, value: unknown) =>
  (
    await resolveSchema(
      Schema.make([TextInput.make("one").mask(mask)]),
      { one: value },
      { operation: "create" },
    )
  ).errors["one"];

describe("a value against the shape it was asked for", () => {
  it("fits with the punctuation the mask writes", async () => {
    expect(await errorFor("(999) 999-9999", "(555) 123-4567")).toBeUndefined();
  });

  it("fits without it, which is how a column usually keeps one", async () => {
    // `dehydrateStateUsing` taking the punctuation off is the ordinary way to
    // store a number, and a rule that demanded it back would refuse every row
    // that had been stored properly.
    expect(await errorFor("(999) 999-9999", "5551234567")).toBeUndefined();
  });

  it("does not fit where there are too few or too many", async () => {
    expect(await errorFor("(999) 999-9999", "555123456")).toBe(
      "Must look like (999) 999-9999.",
    );
    expect(await errorFor("(999) 999-9999", "55512345678")).toBe(
      "Must look like (999) 999-9999.",
    );
  });

  it("does not fit where a character is the wrong kind", async () => {
    expect(await errorFor("(999) 999-9999", "(555) ABC-4567")).toBe(
      "Must look like (999) 999-9999.",
    );
  });

  it("reads letters and either where the mask asks for them", async () => {
    expect(await errorFor("aa-9999", "AB-1234")).toBeUndefined();
    expect(await errorFor("aa-9999", "12-1234")).toBe("Must look like aa-9999.");
    expect(await errorFor("**-**", "a1-2b")).toBeUndefined();
  });

  it("says nothing about an empty box", async () => {
    // Whether a value is needed at all is `required`'s question, asked before
    // this one and worded on its own.
    expect(await errorFor("(999) 999-9999", "")).toBeUndefined();
    expect(await errorFor("(999) 999-9999", null)).toBeUndefined();
  });

  it("can be given words of its own", async () => {
    const made = TextInput.make("one")
      .mask("(999) 999-9999")
      .validationMessages({ mask: "A telephone number, please." });
    const errors = (
      await resolveSchema(Schema.make([made]), { one: "5" }, { operation: "create" })
    ).errors;

    expect(errors["one"]).toBe("A telephone number, please.");
  });
});

describe("a mask that cannot be read back out of a value", () => {
  it("stops the boot where a literal is a letter or a digit", () => {
    // The rule strips punctuation before comparing. A literal that is not
    // punctuation cannot be told from a position the reader filled, and both
    // readings are wrong for some value.
    const complaints = auditSchema(
      Schema.make([TextInput.make("one").mask("A9-999")]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("cannot be told from")]);
  });

  it("stops the boot where there is nothing to fill", () => {
    const complaints = auditSchema(
      Schema.make([TextInput.make("one").mask("()-")]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("nothing in it to fill")]);
  });

  it("stops the boot where a length limit stands beside it", () => {
    // `.maxLength(10)` beside a telephone mask reads as ten digits and is a box
    // the reader cannot fill: the value carries the punctuation the mask writes,
    // so the browser stops them at `(555) 123-` and the rule refuses a complete
    // number. Nothing on screen would say why.
    const complaints = auditSchema(
      Schema.make([TextInput.make("one").mask("(999) 999-9999").maxLength(10)]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("`maxLength` beside a mask")]);
    expect(
      auditSchema(
        Schema.make([TextInput.make("one").mask("aa-9999").minLength(2).maxLength(9)]),
      ).map((one) => one.problem),
    ).toEqual([expect.stringContaining("`minLength`, `maxLength` beside a mask")]);
  });

  it("says nothing about one that can", () => {
    expect(
      auditSchema(Schema.make([TextInput.make("one").mask("(999) 999-9999")])),
    ).toEqual([]);
    expect(auditSchema(Schema.make([TextInput.make("one").mask("aa-9999")]))).toEqual(
      [],
    );
  });
});

describe("on the wire", () => {
  it("crosses, the browser being the half that shapes a keystroke", async () => {
    const { serialise } = await import("./serialise.js");
    const node = serialise(
      await resolveSchema(
        Schema.make([TextInput.make("one").mask("(999) 999-9999")]),
        {},
        { operation: "create" },
      ),
    ).schema.children?.[0];

    expect(node?.props?.["mask"]).toBe("(999) 999-9999");
  });
});
