/**
 * What a field says when a limit is not met, and who gets to write it.
 *
 * The framework's own messages are the ones a resource can replace, because
 * they are the ones the framework wrote: a length, a shape, a bound. A rule an
 * author passed to `.rule()` carries the words they chose, and there is nothing
 * in it to override — which is why a rule has a kind only where the framework
 * put one there.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import { ruleFor } from "./field.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { DateTimePicker } from "./fields/date-time-picker.js";
import { TextInput } from "./fields/text-input.js";

const errorFor = async (made: TextInput | DateTimePicker, value: unknown) =>
  (await resolveSchema(Schema.make([made]), { one: value }, { operation: "create" }))
    .errors["one"];

describe("a message a field declared", () => {
  it("is said instead of the framework's", async () => {
    const made = TextInput.make("one")
      .maxLength(3)
      .validationMessages({ maxLength: "Keep it short." });

    expect(await errorFor(made, "Ada Lovelace")).toBe("Keep it short.");
  });

  it("replaces only the limit it names", async () => {
    const made = TextInput.make("one")
      .minLength(4)
      .maxLength(6)
      .validationMessages({ maxLength: "Keep it short." });

    expect(await errorFor(made, "Ada")).toBe("Must be at least 4 characters.");
    expect(await errorFor(made, "Ada Lovelace")).toBe("Keep it short.");
  });

  it("covers being required, which is checked before any rule", async () => {
    const made = TextInput.make("one")
      .required()
      .validationMessages({ required: "We need this one." });

    expect(await errorFor(made, "")).toBe("We need this one.");
  });

  it("covers a shape as well as a length", async () => {
    const made = TextInput.make("one")
      .email()
      .validationMessages({ email: "That does not look like an address." });

    expect(await errorFor(made, "ada")).toBe("That does not look like an address.");
  });

  it("covers a bound on a date", async () => {
    const made = DateTimePicker.make("one")
      .minDate("2026-01-01")
      .validationMessages({ minDate: "Nothing before this year." });

    expect(await errorFor(made, "2025-06-01")).toBe("Nothing before this year.");
  });

  it("leaves the framework's where nothing was said", async () => {
    expect(await errorFor(TextInput.make("one").maxLength(3), "Ada Lovelace")).toBe(
      "Must be at most 3 characters.",
    );
  });
});

describe("a rule an author wrote", () => {
  it("keeps its own words, there being nothing to override", async () => {
    // It has no kind, so no key names it. The author wrote the message; a
    // second way to write it would be two places to look.
    const made = TextInput.make("one")
      .rule((value) => (value === "Ada" ? true : "Only Ada."))
      .validationMessages({ maxLength: "Keep it short." })
      .maxLength(50);

    expect(await errorFor(made, "Grace")).toBe("Only Ada.");
  });
});

describe("tagging a rule", () => {
  it("leaves the check it was given alone", () => {
    // `Object.assign` writes the property onto the function it is handed. A
    // check held anywhere but the call — hoisted to module scope, shared
    // between two fields — would carry whichever kind tagged it last, and the
    // type says `readonly`.
    const check = (): true => true;
    const asLength = ruleFor("maxLength", check);
    const asItems = ruleFor("maxItems", check);

    expect(asLength.kind).toBe("maxLength");
    expect(asItems.kind).toBe("maxItems");
    expect((check as { kind?: string }).kind).toBeUndefined();
  });

  it("still checks what it was given", () => {
    const tagged = ruleFor("maxLength", (value) => (value === "Ada" ? true : "No."));

    expect(tagged("Ada", {} as never)).toBe(true);
    expect(tagged("Grace", {} as never)).toBe("No.");
  });
});

describe("a message for a limit the field does not have", () => {
  it("stops the boot, nothing being able to say it", () => {
    // It looks exactly like one that works: the field validates, the form
    // saves, and the words sit there waiting for a limit nobody added.
    const complaints = auditSchema(
      Schema.make([
        TextInput.make("one").validationMessages({ maxLength: "Keep it short." }),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("maxLength");
  });

  it("says the same of `required` where the field is not", () => {
    const complaints = auditSchema(
      Schema.make([
        TextInput.make("one").validationMessages({ required: "We need this." }),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("required");
  });

  it("says nothing where every key names a limit that is there", () => {
    expect(
      auditSchema(
        Schema.make([
          TextInput.make("one").required().maxLength(3).email().validationMessages({
            required: "We need this.",
            maxLength: "Keep it short.",
            email: "Not an address.",
          }),
        ]),
      ),
    ).toEqual([]);
  });
});
