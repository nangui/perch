/**
 * The same contract, against a library that did not help write it.
 *
 * `standard-schema.test.ts` spells its schemas out by hand, and says in its own
 * header why that is a weakness: they agree with the reading of the
 * specification that wrote them. This one runs a real implementation, which is
 * the only way to find out that the reading was wrong.
 *
 * Zod because it is the one most readers already have. It is a dev dependency
 * of this package and of nothing that ships: the domain's dependency list is
 * empty and stays empty, and the guide's example compiles against this same
 * install.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { TextInput } from "./fields/text-input.js";

const resolved = async (made: TextInput, value: unknown) =>
  await resolveSchema(Schema.make([made]), { one: value }, { operation: "create" });

const errorFor = async (made: TextInput, value: unknown) =>
  (await resolved(made, value)).errors["one"];

describe("a zod schema, where a rule is taken", () => {
  it("is taken at all, which is the type saying the shape was read right", async () => {
    // It compiles or it does not. The assertion below is the runtime half.
    const made = TextInput.make("one").rule(z.string());

    expect(await errorFor(made, "Ada")).toBeUndefined();
  });

  it("refuses with the words the schema was given", async () => {
    const made = TextInput.make("one").rule(
      z.string().regex(/^[a-z0-9-]+$/, "Lowercase and dashes only."),
    );

    expect(await errorFor(made, "Ada Lovelace")).toBe("Lowercase and dashes only.");
    expect(await errorFor(made, "ada-lovelace")).toBeUndefined();
  });

  it("refuses with zod's own words where it was given none", async () => {
    const made = TextInput.make("one").rule(z.string().min(5));
    const said = await errorFor(made, "Ada");

    // Not asserted word for word: they are zod's to change, and a test that
    // pinned them would fail on an upgrade that broke nothing.
    expect(said).toBeTypeOf("string");
    expect(said).not.toBe("");
  });

  it("waits for a refinement that answers later", async () => {
    const made = TextInput.make("one").rule(
      z
        .string()
        .refine(
          (value) => Promise.resolve(value === "Ada"),
          "Only Ada is on the list.",
        ),
    );

    expect(await errorFor(made, "Ada")).toBeUndefined();
    expect(await errorFor(made, "Grace")).toBe("Only Ada is on the list.");
  });

  it("drops what a transforming schema hands back", async () => {
    // The decision this is here to hold: a schema is an answer, not a
    // replacement. Zod is glad to return a different value; nothing takes it.
    const after = await resolved(
      TextInput.make("one").rule(z.string().transform((value) => value.toUpperCase())),
      "Ada",
    );

    expect(after.errors["one"]).toBeUndefined();
    expect(after.state["one"]).toBe("Ada");
  });

  it("stands beside the framework's own limits", async () => {
    const made = TextInput.make("one")
      .maxLength(12)
      .rule(z.string().regex(/^[a-z]+$/, "Letters only."));

    expect(await errorFor(made, "Ada Lovelace!!")).toBe(
      "Must be at most 12 characters.",
    );
    expect(await errorFor(made, "Ada")).toBe("Letters only.");
  });
});
