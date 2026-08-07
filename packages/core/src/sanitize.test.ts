/**
 * The attack tests PRD 03 §6 requires, run against the trust boundary itself.
 */
import { describe, expect, it } from "vitest";
import { Schema, Section } from "./layout.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import type { ResolveOptions } from "./resolve.js";
import { sanitize } from "./sanitize.js";

const EDIT: ResolveOptions = { operation: "edit" };

function form() {
  return Schema.make([
    Section.make("Post").schema([
      TextInput.make("title"),
      TextInput.make("slug").readOnly(),
      TextInput.make("authorId").disabled(),
      Select.make("countryId").options({ fr: "France" }).live(),
      Select.make("cityId")
        .options(() => [{ value: 1, label: "Paris" }])
        .visible(({ get }) => Boolean(get("countryId"))),
    ]),
  ]);
}

const resolved = () => resolveSchema(form(), { title: "Hello" }, EDIT);

describe("PRD 03 §6.3 — an unknown path has no effect and no 500", () => {
  it("drops it", async () => {
    const { state, rejected } = sanitize(await resolved(), {
      title: "Hello",
      isAdmin: true,
    });
    expect(state).toEqual({ title: "Hello" });
    expect(rejected).toEqual([{ path: "isAdmin", reason: "unknown-path" }]);
  });

  it("does not throw, whatever arrives", async () => {
    const previous = await resolved();
    expect(() => sanitize(previous, { "a.b.c": 2, "": 3 })).not.toThrow();
  });

  it("does not let a JSON payload pollute Object.prototype", async () => {
    // A literal `{ "__proto__": … }` sets the prototype and creates no own
    // property, so it would test nothing. JSON.parse creates the own property
    // an attacker actually sends.
    const payload = JSON.parse('{"title":"b","__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    const result = sanitize(await resolved(), payload);

    expect(result.state).toEqual({ title: "b" });
    expect(result.rejected).toEqual([{ path: "__proto__", reason: "unknown-path" }]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("PRD 03 §6.2 — a forged state reaches neither the tree nor the write", () => {
  it("drops a disabled field", async () => {
    const { state, rejected } = sanitize(await resolved(), { authorId: 99 });
    expect(state).toEqual({});
    expect(rejected).toEqual([{ path: "authorId", reason: "disabled" }]);
  });

  it("drops a readOnly field", async () => {
    const { rejected } = sanitize(await resolved(), { slug: "forged" });
    expect(rejected).toEqual([{ path: "slug", reason: "read-only" }]);
  });

  it("drops a field the server had resolved as invisible", async () => {
    // cityId is hidden while no country is chosen; the client claims otherwise.
    const { state, rejected } = sanitize(await resolved(), { cityId: 7 });
    expect(state).toEqual({});
    expect(rejected).toEqual([{ path: "cityId", reason: "invisible" }]);
  });

  it("keeps the forged value out of the database, end to end", async () => {
    const previous = await resolved();
    const clean = sanitize(previous, { title: "Hello", authorId: 99, slug: "x" });
    const next = await resolveSchema(form(), clean.state, {
      ...EDIT,
      dirtyPath: "title",
      previous,
    });
    expect(dehydrate(next, EDIT)).toEqual({ title: "Hello" });
  });
});

describe("legitimate input still passes", () => {
  it("keeps a visible, editable field", async () => {
    const { state, rejected } = sanitize(await resolved(), { title: "Changed" });
    expect(state).toEqual({ title: "Changed" });
    expect(rejected).toEqual([]);
  });

  it("accepts a field once the server itself made it visible", async () => {
    const previous = await resolveSchema(form(), { countryId: "fr" }, EDIT);
    const { state, rejected } = sanitize(previous, { cityId: 1 });
    expect(state).toEqual({ cityId: 1 });
    expect(rejected).toEqual([]);
  });
});

describe("the rejection reason never leaves the server", () => {
  it("is returned separately from the state, not merged into it", async () => {
    const result = sanitize(await resolved(), { slug: "forged" });
    expect(Object.keys(result.state)).toEqual([]);
    expect(result).toHaveProperty("rejected");
    // The caller decides what to log; nothing here shapes a client response.
    expect(JSON.stringify(result.state)).not.toContain("read-only");
  });
});
