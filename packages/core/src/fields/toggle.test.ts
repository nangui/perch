import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { Toggle } from "./toggle.js";

const tree = (state: Record<string, unknown> = {}) =>
  resolveSchema(Schema.make([Toggle.make("live").required()]), state, {
    operation: "create",
  });

describe("required, on a switch", () => {
  it("is not satisfied by leaving it off", async () => {
    expect((await tree({ live: false })).errors["live"]).toBe(
      "This field is required.",
    );
  });

  it("is satisfied by turning it on", async () => {
    expect((await tree({ live: true })).errors["live"]).toBeUndefined();
  });
});

describe("what a switch may hold", () => {
  it("refuses anything that is not a boolean", async () => {
    const clean = sanitize(await tree(), { live: "on" });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "live", reason: "wrong-shape" }]);
  });

  it("takes both, turning off included", async () => {
    expect(sanitize(await tree(), { live: false }).state).toEqual({ live: false });
  });
});

describe("on the wire", () => {
  it("carries what it was told to draw and to colour", async () => {
    const result = await resolveSchema(
      Schema.make([
        Toggle.make("live").onIcon("check").offIcon("close").onColor("success"),
      ]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.props).toEqual({
      onIcon: "check",
      offIcon: "close",
      onColor: "success",
    });
  });

  it("carries nothing at all when nothing was asked for", async () => {
    const result = await resolveSchema(
      Schema.make([Toggle.make("live")]),
      {},
      { operation: "create" },
    );

    expect(serialise(result).schema.children?.[0]?.props).toBeUndefined();
  });

  it("commits at once, because flipping is a decision and not typing", () => {
    expect(Toggle.make("live").live().state.live?.debounce).toBe(0);
  });
});
