/**
 * A schema from another library, where a rule is taken.
 *
 * `.rule()` takes a function, and that is the whole of what validation is here.
 * A reader who already has a schema had to unwrap it by hand, and the one
 * property every schema library now agrees on makes that unnecessary. Nothing
 * is depended on for it: the specification is a shape, and a shape can be
 * spelled.
 *
 * The schemas below are written out rather than taken from a library, which is
 * the honest weakness of this file: they agree with the reading of the
 * specification that wrote them. The shapes come from the specification's own
 * text, success carrying `value` and failure carrying `issues`, and an issue
 * carrying a `path` nothing here reads.
 */
import { describe, expect, it } from "vitest";
import type { StandardSchema } from "./field.js";
import { SCHEMA_REFUSED } from "./field.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { TextInput } from "./fields/text-input.js";

/** A schema that answers at once, the way a synchronous library does. */
function refusing(...messages: readonly string[]): StandardSchema {
  return {
    "~standard": {
      validate: (value: unknown) =>
        messages.length === 0
          ? { value }
          : { issues: messages.map((message) => ({ message, path: ["one"] })) },
    },
  };
}

const resolved = async (made: TextInput, value: unknown) =>
  await resolveSchema(Schema.make([made]), { one: value }, { operation: "create" });

const errorFor = async (made: TextInput, value: unknown) =>
  (await resolved(made, value)).errors["one"];

describe("a schema where a rule is taken", () => {
  it("passes what it accepts", async () => {
    expect(
      await errorFor(TextInput.make("one").rule(refusing()), "Ada"),
    ).toBeUndefined();
  });

  it("refuses with the words the schema wrote", async () => {
    const made = TextInput.make("one").rule(refusing("Lowercase and dashes only."));

    expect(await errorFor(made, "Ada Lovelace")).toBe("Lowercase and dashes only.");
  });

  it("shows the first issue, a field holding one error at a time", async () => {
    const made = TextInput.make("one").rule(refusing("Too long.", "Wrong shape."));

    expect(await errorFor(made, "Ada Lovelace")).toBe("Too long.");
  });

  it("waits for one that answers later", async () => {
    // The specification lets validate return a promise, and a library that
    // reaches anything at all does.
    const slow: StandardSchema = {
      "~standard": {
        validate: (value: unknown) =>
          Promise.resolve(
            String(value) === "Ada" ? { value } : { issues: [{ message: "Not Ada." }] },
          ),
      },
    };

    expect(await errorFor(TextInput.make("one").rule(slow), "Ada")).toBeUndefined();
    expect(await errorFor(TextInput.make("one").rule(slow), "Grace")).toBe("Not Ada.");
  });

  it("refuses a value a schema refused without saying why", async () => {
    // Issues present is the refusal, and an empty list is a schema saying no
    // with nothing to show. Reading it as a pass would save the value it
    // refused, which is the one outcome that cannot be right.
    const silent: StandardSchema = {
      "~standard": { validate: () => ({ issues: [] }) },
    };

    expect(await errorFor(TextInput.make("one").rule(silent), "Ada")).toBe(
      SCHEMA_REFUSED,
    );
  });

  it("reads what a schema returns as an answer, never as a replacement", async () => {
    // A schema that transforms hands back an output. It is dropped: what is
    // resolved is what arrived, and rewriting a value is what formatStateUsing
    // is for.
    const shouting: StandardSchema = {
      "~standard": {
        validate: (value: unknown) => ({ value: String(value).toUpperCase() }),
      },
    };
    const after = await resolved(TextInput.make("one").rule(shouting), "Ada");

    expect(after.errors["one"]).toBeUndefined();
    expect(after.state["one"]).toBe("Ada");
  });

  it("stands beside a rule written as a function", async () => {
    const made = TextInput.make("one").rules([
      (value) => (String(value).length > 2 ? true : "Too short."),
      refusing("The schema says no."),
    ]);

    expect(await errorFor(made, "A")).toBe("Too short.");
    expect(await errorFor(made, "Ada")).toBe("The schema says no.");
  });

  it("carries no kind, so nothing renames it", async () => {
    // The same rule the framework applies to a function passed here: whoever
    // wrote the check wrote the words, and validationMessages has no key for it.
    const made = TextInput.make("one")
      .maxLength(30)
      .rule(refusing("The schema says no."))
      .validationMessages({ maxLength: "Keep it short." });

    expect(await errorFor(made, "Ada")).toBe("The schema says no.");
  });
});
