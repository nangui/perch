import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { Radio } from "./radio.js";

const CHOICES = { draft: "Draft", live: "Live" };
const tree = (field = Radio.make("status").options(CHOICES)) =>
  resolveSchema(Schema.make([field]), {}, { operation: "create" });

describe("what a radio may hold", () => {
  it("takes a value it offered", async () => {
    expect(sanitize(await tree(), { status: "live" }).state).toEqual({
      status: "live",
    });
  });

  it("refuses one it did not", async () => {
    // Every choice is on the page: there is no window and no relation to excuse
    // a value from outside the list.
    const clean = sanitize(await tree(), { status: "deleted" });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "status", reason: "undeclared-value" }]);
  });

  it("refuses a list, holding one value", async () => {
    expect(sanitize(await tree(), { status: ["draft", "live"] }).rejected).toEqual([
      { path: "status", reason: "wrong-shape" },
    ]);
  });

  it("lets itself be cleared", async () => {
    expect(sanitize(await tree(), { status: "" }).state).toEqual({ status: "" });
  });

  it("matches a key declared as a number against the text a form returns", async () => {
    const numbered = Radio.make("rank").options([{ value: 2, label: "Second" }]);

    expect(sanitize(await tree(numbered), { rank: "2" }).state).toEqual({ rank: "2" });
  });

  it("matches a key declared as text against a number a client sends", async () => {
    // JSON carries numbers, so both sides have to be read as text — not just
    // the declared one.
    const texts = Radio.make("rank").options([{ value: "2", label: "Second" }]);

    expect(sanitize(await tree(texts), { rank: 2 }).state).toEqual({ rank: 2 });
  });
});

describe("a radio with no choices", () => {
  it("stops the boot rather than offering nothing", () => {
    expect(auditSchema(Schema.make([Radio.make("status")]))).toEqual([
      {
        field: "status",
        problem: "has no options, so it offers nothing and would refuse anything",
      },
    ]);
  });

  it("draws no complaint once it has them", () => {
    expect(auditSchema(Schema.make([Radio.make("status").options(CHOICES)]))).toEqual(
      [],
    );
  });
});

describe("on the wire", () => {
  it("carries the choices, resolved", async () => {
    expect(serialise(await tree()).schema.children?.[0]?.options).toEqual([
      { value: "draft", label: "Draft" },
      { value: "live", label: "Live" },
    ]);
  });

  it("carries how the choices are laid out", async () => {
    const result = await tree(Radio.make("status").options(CHOICES).inline());

    expect(serialise(result).schema.children?.[0]?.props).toEqual({ inline: true });
  });

  it("keeps that apart from where the label sits", async () => {
    // One word for both is what Filament spent years untangling. `inline` is
    // about the choices; `inlineLabel` is about the label.
    const result = await tree(Radio.make("status").options(CHOICES).inlineLabel());
    const node = serialise(result).schema.children?.[0];

    expect(node?.inlineLabel).toBe(true);
    expect(node?.props).toEqual({ inline: false });
  });

  it("commits at once, because picking is a decision and not typing", () => {
    expect(Radio.make("status").options(CHOICES).live().state.live?.debounce).toBe(0);
  });
});
