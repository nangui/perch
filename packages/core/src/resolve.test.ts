/**
 * The resolution cycle, and milestone A1 — PRD 02 §7 and PRD 00 §9.
 */
import { describe, expect, it } from "vitest";
import { Schema, Section } from "./layout.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, ResolutionCycleError, resolveSchema } from "./resolve.js";
import type { ResolveOptions } from "./resolve.js";

const CREATE: ResolveOptions = { operation: "create" };

const CITIES: Record<string, { value: number; label: string }[]> = {
  fr: [
    { value: 1, label: "Paris" },
    { value: 2, label: "Lyon" },
  ],
  be: [{ value: 3, label: "Brussels" }],
};

/** The A1 form: a country select, and a city select that depends on it. */
function a1() {
  return Schema.make([
    Section.make("Location").schema([
      Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
      Select.make("cityId")
        .options(({ get }) => CITIES[String(get("countryId"))] ?? [])
        .visible(({ get }) => Boolean(get("countryId")))
        .helperText("Pick a country first"),
    ]),
  ]);
}

const node = (r: Awaited<ReturnType<typeof resolveSchema>>, id: string) =>
  r.nodes.find((n) => n.id === id);

describe("A1 — dependent select, one round trip", () => {
  it("hides the city while no country is chosen", async () => {
    const result = await resolveSchema(a1(), {}, CREATE);
    expect(node(result, "cityId")?.visible).toBe(false);
    expect(node(result, "cityId")?.options).toEqual([]);
  });

  it("shows the city and its options once a country is chosen", async () => {
    const result = await resolveSchema(a1(), { countryId: "fr" }, CREATE);
    const city = node(result, "cityId");
    expect(city?.visible).toBe(true);
    expect(city?.options).toEqual([
      { value: 1, label: "Paris" },
      { value: 2, label: "Lyon" },
    ]);
  });

  it("changes the options when the country changes, in one pass", async () => {
    const result = await resolveSchema(a1(), { countryId: "be" }, CREATE);
    expect(node(result, "cityId")?.options).toEqual([{ value: 3, label: "Brussels" }]);
    expect(result.passes).toBe(1);
  });

  it("normalises the shorthand options map", async () => {
    const result = await resolveSchema(a1(), {}, CREATE);
    expect(node(result, "countryId")?.options).toEqual([
      { value: "fr", label: "France" },
      { value: "be", label: "Belgium" },
    ]);
  });
});

describe("pruning — PRD 02 §7.3", () => {
  it("drops the value of a field that became invisible", async () => {
    const result = await resolveSchema(a1(), { countryId: "", cityId: 2 }, CREATE);
    expect(node(result, "cityId")?.visible).toBe(false);
    expect(result.state).not.toHaveProperty("cityId");
  });

  it("keeps it once the field is visible again", async () => {
    const result = await resolveSchema(a1(), { countryId: "fr", cityId: 2 }, CREATE);
    expect(result.state["cityId"]).toBe(2);
  });
});

describe("targeted re-evaluation — PRD 02 §7.2", () => {
  function wide() {
    const fields = Array.from({ length: 38 }, (_, i) =>
      TextInput.make(`f${String(i)}`).label(() => `Field ${String(i)}`),
    );
    return Schema.make([
      ...fields,
      Select.make("countryId").options({ fr: "France" }).live(),
      Select.make("cityId").options(
        ({ get }) => CITIES[String(get("countryId"))] ?? [],
      ),
    ]);
  }

  it("re-evaluates only what depends on the changed path", async () => {
    const form = wide();
    const first = await resolveSchema(form, { countryId: "fr" }, CREATE);
    expect(first.resolverCalls).toBeGreaterThan(38);

    const second = await resolveSchema(
      form,
      { countryId: "be" },
      { ...CREATE, dirtyPath: "countryId", previous: first },
    );
    // Only cityId reads countryId. Forty resolvers exist; one runs.
    expect(second.resolverCalls).toBeLessThanOrEqual(3);
  });
});

describe("hooks and the bounded loop — PRD 02 §7.6", () => {
  it("lets a hook set another field, then settles", async () => {
    const form = Schema.make([
      TextInput.make("price").afterStateUpdated(({ value, set }) => {
        set("total", Number(value) * 2);
      }),
      TextInput.make("total"),
    ]);
    const result = await resolveSchema(
      form,
      { price: 10 },
      { ...CREATE, dirtyPath: "price" },
    );
    expect(result.state["total"]).toBe(20);
    expect(result.passes).toBeLessThanOrEqual(2);
  });

  it("throws naming the fields when two hooks chase each other", async () => {
    const form = Schema.make([
      TextInput.make("a").afterStateUpdated(({ set }) => {
        set("b", Math.random());
      }),
      TextInput.make("b").afterStateUpdated(({ set }) => {
        set("a", Math.random());
      }),
    ]);
    await expect(
      resolveSchema(form, { a: 1 }, { ...CREATE, dirtyPath: "a" }),
    ).rejects.toThrow(ResolutionCycleError);
  });

  it("names the offending fields in the message, not a stack overflow", async () => {
    const form = Schema.make([
      TextInput.make("a").afterStateUpdated(({ set }) => {
        set("b", Math.random());
      }),
      TextInput.make("b").afterStateUpdated(({ set }) => {
        set("a", Math.random());
      }),
    ]);
    await expect(
      resolveSchema(form, { a: 1 }, { ...CREATE, dirtyPath: "a" }),
    ).rejects.toThrow(/a|b/);
  });
});

describe("defaults", () => {
  it("fills a blank field on first load only", async () => {
    const form = Schema.make([TextInput.make("status").default("draft")]);
    expect((await resolveSchema(form, {}, CREATE)).state["status"]).toBe("draft");

    const patched = await resolveSchema(form, {}, { ...CREATE, dirtyPath: "status" });
    expect(patched.state).not.toHaveProperty("status");
  });

  it("does not overwrite a value the client already sent", async () => {
    const form = Schema.make([TextInput.make("status").default("draft")]);
    expect(
      (await resolveSchema(form, { status: "live" }, CREATE)).state["status"],
    ).toBe("live");
  });
});

describe("validation runs on visible fields only — PRD 02 §6", () => {
  it("reports a blank required field", async () => {
    const form = Schema.make([TextInput.make("name").required()]);
    const result = await resolveSchema(form, {}, CREATE);
    expect(result.errors["name"]).toBe("This field is required.");
  });

  it("says nothing about a required field that is invisible", async () => {
    const form = Schema.make([TextInput.make("name").required().hidden()]);
    expect((await resolveSchema(form, {}, CREATE)).errors).toEqual({});
  });

  it("returns the message a custom rule produced", async () => {
    const form = Schema.make([
      TextInput.make("code").rule((v) => (v === "ok" ? true : "Wrong code.")),
    ]);
    const result = await resolveSchema(form, { code: "no" }, CREATE);
    expect(result.errors["code"]).toBe("Wrong code.");
  });
});

describe("dehydrate — what reaches the database", () => {
  it("writes visible fields and skips the invisible one", async () => {
    const result = await resolveSchema(a1(), { countryId: "fr", cityId: 1 }, CREATE);
    expect(dehydrate(result, CREATE)).toEqual({ countryId: "fr", cityId: 1 });

    const hidden = await resolveSchema(a1(), {}, CREATE);
    expect(dehydrate(hidden, CREATE)).toEqual({});
  });

  it("skips a readOnly field, which PRD 06 §2 says is not persisted", async () => {
    const form = Schema.make([
      TextInput.make("slug").readOnly(),
      TextInput.make("title"),
    ]);
    const result = await resolveSchema(form, { slug: "a", title: "b" }, CREATE);
    expect(dehydrate(result, CREATE)).toEqual({ title: "b" });
  });

  it("skips a blank password rather than overwriting the hash", async () => {
    const form = Schema.make([TextInput.make("password").password()]);
    const blank = await resolveSchema(form, { password: "" }, CREATE);
    expect(dehydrate(blank, CREATE)).toEqual({});

    const filled = await resolveSchema(form, { password: "hunter2" }, CREATE);
    expect(dehydrate(filled, CREATE)).toEqual({ password: "hunter2" });
  });
});

describe("a targeted pass stays complete", () => {
  it("carries forward a node whose resolvers read nothing that changed", async () => {
    // Dropping it would take the field out of pruning and out of validation,
    // which is how a hidden value survives a patch.
    const form = Schema.make([
      TextInput.make("a"),
      TextInput.make("b")
        .required()
        .label(({ get }) => (get("other") === undefined ? "B" : "other")),
    ]);
    const first = await resolveSchema(form, {}, CREATE);
    const second = await resolveSchema(
      form,
      { a: 1 },
      { ...CREATE, dirtyPath: "a", previous: first },
    );

    expect(second.nodes.map((n) => n.id).sort()).toEqual(
      first.nodes.map((n) => n.id).sort(),
    );
    expect(second.errors).toEqual(first.errors);
  });
});

describe("the tree survives resolution", () => {
  it("keeps children under their parent, which the renderer walks", async () => {
    const form = Schema.make([Section.make("S").schema([TextInput.make("a")])]);
    const result = await resolveSchema(form, {}, CREATE);
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0]?.children[0]?.id).toBe("a");
  });
});

describe("a resolver may not write", () => {
  it("refuses set() instead of ignoring it", async () => {
    const form = Schema.make([
      TextInput.make("a").label(({ set }) => {
        set("b", 1);
        return "x";
      }),
    ]);
    await expect(resolveSchema(form, {}, CREATE)).rejects.toThrow(/cannot set state/);
  });
});
