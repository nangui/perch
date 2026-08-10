/**
 * The cross-cutting field API, and the two predicates that decide what a forged
 * payload can reach: `acceptsClientState` and `isDehydrated`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Component } from "./component.js";
import type { ResolvedFlags } from "./field.js";
import { acceptsClientState, isDehydrated } from "./field.js";
import { Select, normaliseOptions } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";

afterEach(() => {
  Component.resetConfigurators();
});

describe("what reaches the database", () => {
  const flags = (patch: Partial<ResolvedFlags> = {}): ResolvedFlags => ({
    visible: true,
    disabled: false,
    readOnly: false,
    ...patch,
  });

  it("writes a visible, editable, dehydrated field", () => {
    expect(isDehydrated(TextInput.make("name"), flags(), "x")).toBe(true);
  });

  it("refuses an invisible field, whatever dehydrated says", () => {
    const field = TextInput.make("name").dehydrated(true);
    expect(isDehydrated(field, flags({ visible: false }), "x")).toBe(false);
  });

  it("refuses a field marked dehydrated(false), even when visible", () => {
    expect(isDehydrated(TextInput.make("name").dehydrated(false), flags(), "x")).toBe(
      false,
    );
  });

  it("refuses a readOnly field, which is not persisted", () => {
    // The case the first version of this function let through.
    expect(isDehydrated(TextInput.make("name"), flags({ readOnly: true }), "x")).toBe(
      false,
    );
  });

  it("still writes a disabled field, because disabled only bars client state", () => {
    // Stage 5 discards a disabled path coming *from* the client; a value the
    // server computed for it is still written.
    expect(isDehydrated(TextInput.make("name"), flags({ disabled: true }), "x")).toBe(
      true,
    );
  });

  it("refuses a blank password rather than overwriting the stored hash", () => {
    const password = TextInput.make("password").password();
    expect(isDehydrated(password, flags(), "")).toBe(false);
    expect(isDehydrated(password, flags(), undefined)).toBe(false);
    expect(isDehydrated(password, flags(), null)).toBe(false);
    expect(isDehydrated(password, flags(), "hunter2")).toBe(true);
  });

  it("keeps that protection when a custom transform is set afterwards", () => {
    const password = TextInput.make("password")
      .password()
      .dehydrateStateUsing((v) => v);
    expect(isDehydrated(password, flags(), "")).toBe(false);
  });
});

describe("what may be taken from the client — stage 5", () => {
  const flags = (patch: Partial<ResolvedFlags> = {}): ResolvedFlags => ({
    visible: true,
    disabled: false,
    readOnly: false,
    ...patch,
  });

  it("accepts a visible, editable field", () => {
    expect(acceptsClientState(flags())).toBe(true);
  });

  it.each([
    ["invisible", { visible: false }],
    ["disabled", { disabled: true }],
    ["readOnly", { readOnly: true }],
  ])("discards an %s field", (_label, patch) => {
    expect(acceptsClientState(flags(patch))).toBe(false);
  });
});

describe("live", () => {
  it("debounces text by 400 ms", () => {
    expect(TextInput.make("title").live().state.live).toEqual({
      debounce: 400,
      onBlur: false,
    });
  });

  it("commits a select immediately", () => {
    expect(Select.make("countryId").live().state.live).toEqual({
      debounce: 0,
      onBlur: false,
    });
  });

  it("takes an explicit debounce and onBlur over the default", () => {
    expect(TextInput.make("q").live({ debounce: 50, onBlur: true }).state.live).toEqual(
      {
        debounce: 50,
        onBlur: true,
      },
    );
  });

  it("is absent until asked for, so no field polls the server by accident", () => {
    expect(TextInput.make("title").state.live).toBeUndefined();
  });
});

describe("TextInput flavours", () => {
  it("starts as plain text", () => {
    expect(TextInput.make("title").state.flavour).toBe("text");
  });

  it.each([
    ["email", (f: TextInput) => f.email()],
    ["url", (f: TextInput) => f.url()],
    ["tel", (f: TextInput) => f.tel()],
    ["numeric", (f: TextInput) => f.numeric()],
    ["password", (f: TextInput) => f.password()],
  ])("switches to %s", (flavour, apply) => {
    expect(apply(TextInput.make("f")).state.flavour).toBe(flavour);
  });

  it("defaults unique to ignoring the record being edited", () => {
    expect(TextInput.make("email").unique().state.unique).toEqual({
      ignoreRecord: true,
    });
    expect(
      TextInput.make("email").unique({ ignoreRecord: false }).state.unique,
    ).toEqual({
      ignoreRecord: false,
    });
  });
});

describe("Select", () => {
  it("takes options as a list or as a shorthand map", () => {
    expect(normaliseOptions({ draft: "Draft", live: "Live" })).toEqual([
      { value: "draft", label: "Draft" },
      { value: "live", label: "Live" },
    ]);
    const list = [{ value: 1, label: "One", disabled: true }];
    expect(normaliseOptions(list)).toBe(list);
  });

  it("records a relationship with a default label field", () => {
    expect(Select.make("authorId").relationship("author").state.relationship).toEqual({
      name: "author",
      labelField: "name",
    });
    expect(
      Select.make("authorId").relationship("author", "email").state.relationship,
    ).toEqual({ name: "author", labelField: "email" });
  });

  it("is not searchable and not preloaded until asked", () => {
    const select = Select.make("countryId");
    expect(select.state.searchable).toBe(false);
    expect(select.state.preload).toBe(false);
    expect(select.state.optionsLimit).toBe(50);
  });

  it("holds a resolver for options rather than calling it", () => {
    // The domain performs no I/O: it stores, it does not call.
    let called = false;
    const select = Select.make("cityId").options(() => {
      called = true;
      return [];
    });
    expect(typeof select.state.options).toBe("function");
    expect(called).toBe(false);
  });
});

describe("immutability holds through the field API", () => {
  it("leaves the source untouched on every fluent call", () => {
    const base = TextInput.make("email");
    const derived = base.email().required().maxLength(255).live();

    expect(base.state.flavour).toBe("text");
    expect(base.state.required).toBeUndefined();
    expect(base.state.maxLength).toBeUndefined();
    expect(base.state.live).toBeUndefined();

    expect(derived.state.flavour).toBe("email");
    expect(derived.state.required).toBe(true);
    expect(derived.state.maxLength).toBe(255);
  });

  it("does not share the rules array between derivations", () => {
    const base = TextInput.make("name").rule(() => true);
    const a = base.rule(() => "a");
    const b = base.rule(() => "b");

    expect(base.state.rules).toHaveLength(1);
    expect(a.state.rules).toHaveLength(2);
    expect(b.state.rules).toHaveLength(2);
  });

  it("preserves the concrete class, so a chain stays a TextInput", () => {
    expect(TextInput.make("x").required().live()).toBeInstanceOf(TextInput);
    expect(Select.make("y").searchable().multiple()).toBeInstanceOf(Select);
  });
});

describe("the A1 shape compiles and holds what it was given", () => {
  it("describes a dependent select without evaluating anything", () => {
    // Milestone A1, expressed in the DSL. Nothing here runs.
    const country = Select.make("countryId").relationship("country", "name").live();
    const city = Select.make("cityId")
      .options(({ get }) => [{ value: 1, label: String(get("countryId")) }])
      .visible(({ get }) => Boolean(get("countryId")))
      .helperText("Pick a country first");

    expect(country.state.live?.debounce).toBe(0);
    expect(country.state.relationship?.name).toBe("country");
    expect(typeof city.state.options).toBe("function");
    expect(typeof city.state.visible).toBe("function");
    expect(city.state.helperText).toBe("Pick a country first");
  });
});
