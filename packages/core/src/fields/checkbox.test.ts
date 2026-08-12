import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";

const tree = (state: Record<string, unknown> = {}) =>
  resolveSchema(Schema.make([Checkbox.make("accepted").required()]), state, {
    operation: "create",
  });

describe("required, on a box", () => {
  it("is not satisfied by leaving it unticked", async () => {
    // `false` is a value; it is not an acceptance. This is what the HTML
    // attribute of the same name means, and what "accept the terms" needs.
    expect((await tree({ accepted: false })).errors["accepted"]).toBe(
      "This field is required.",
    );
  });

  it("is satisfied by ticking it", async () => {
    expect((await tree({ accepted: true })).errors["accepted"]).toBeUndefined();
  });

  it("is not satisfied by never touching it either", async () => {
    expect((await tree()).errors["accepted"]).toBe("This field is required.");
  });
});

describe("required, elsewhere", () => {
  it("still counts `false` as a value where a field holds one", async () => {
    // The question is asked of the field, so a checkbox answering `false` does
    // not make every other field answer it too.
    const { TextInput } = await import("./text-input.js");
    const result = await resolveSchema(
      Schema.make([TextInput.make("count").required()]),
      { count: 0 },
      { operation: "create" },
    );

    expect(result.errors["count"]).toBeUndefined();
  });
});

describe("what a box may hold", () => {
  it("refuses anything that is not a boolean", async () => {
    const clean = sanitize(await tree(), { accepted: "yes" });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "accepted", reason: "wrong-shape" }]);
  });

  it("takes both booleans, unticking included", async () => {
    expect(sanitize(await tree(), { accepted: false }).state).toEqual({
      accepted: false,
    });
    expect(sanitize(await tree(), { accepted: true }).state).toEqual({
      accepted: true,
    });
  });
});

describe("on the wire", () => {
  it("carries whether its label sits beside it", async () => {
    // Named for what it does. A radio group lays its *choices* out in a row,
    // which is a different decision, and one word for both is what Filament
    // spent years untangling.
    const result = await resolveSchema(
      Schema.make([Checkbox.make("accepted").inlineLabel()]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.inlineLabel).toBe(true);
  });

  it("says nothing about it when it was not asked for", async () => {
    const result = await resolveSchema(
      Schema.make([Checkbox.make("accepted")]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]).not.toHaveProperty("inlineLabel");
  });

  it("commits at once, because ticking is a decision and not typing", () => {
    expect(Checkbox.make("accepted").live().state.live?.debounce).toBe(0);
  });
});
