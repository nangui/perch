/**
 * The attack tests, run against the trust boundary itself.
 */
import { describe, expect, it } from "vitest";
import { Schema, Section } from "./layout.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import type { ResolveOptions, ResolveResult } from "./resolve.js";
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

describe("an unknown path has no effect and no 500", () => {
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

describe("a forged state reaches neither the tree nor the write", () => {
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

describe("what a value has to be", () => {
  function treeOf(schema: Schema): Promise<ResolveResult> {
    return resolveSchema(schema, {}, { operation: "create" });
  }

  const CHOICES = Schema.make([
    Select.make("status").options({ draft: "Draft", live: "Live" }),
    Select.make("tags").options({ a: "Alpha", b: "Beta" }).multiple(),
    TextInput.make("title"),
  ]);

  it("refuses a value the declaration never named", async () => {
    const clean = sanitize(await treeOf(CHOICES), { status: "deleted" });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "status", reason: "undeclared-value" }]);
  });

  it("takes one it did", async () => {
    const clean = sanitize(await treeOf(CHOICES), { status: "live" });

    expect(clean.state).toEqual({ status: "live" });
  });

  it("refuses a list where the field holds one value", async () => {
    const clean = sanitize(await treeOf(CHOICES), { status: ["draft", "live"] });

    expect(clean.rejected).toEqual([{ path: "status", reason: "wrong-shape" }]);
  });

  it("refuses one value where the field holds a list", async () => {
    const clean = sanitize(await treeOf(CHOICES), { tags: "a" });

    expect(clean.rejected).toEqual([{ path: "tags", reason: "wrong-shape" }]);
  });

  it("refuses a whole list for one bad member", async () => {
    // Not a filtered list: half a selection is a choice the reader never made.
    const clean = sanitize(await treeOf(CHOICES), { tags: ["a", "forged"] });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "tags", reason: "undeclared-value" }]);
  });

  it("takes a list whose members were all declared", async () => {
    const clean = sanitize(await treeOf(CHOICES), { tags: ["a", "b"] });

    expect(clean.state).toEqual({ tags: ["a", "b"] });
  });

  it("refuses an object anywhere at all", async () => {
    const clean = sanitize(await treeOf(CHOICES), { title: { toString: "gotcha" } });

    expect(clean.rejected).toEqual([{ path: "title", reason: "wrong-shape" }]);
  });

  it("lets a field be cleared, which no declaration names either", async () => {
    const clean = sanitize(await treeOf(CHOICES), { status: "", tags: [] });

    expect(clean.state).toEqual({ status: "", tags: [] });
    expect(clean.rejected).toEqual([]);
  });

  it("matches as text, because a form returns a key as one", async () => {
    const numbered = Schema.make([
      Select.make("rank").options([{ value: 2, label: "Second" }]),
    ]);

    const clean = sanitize(await treeOf(numbered), { rank: "2" });

    expect(clean.state).toEqual({ rank: "2" });
  });

  it("leaves a relationship alone, whose options are a window not a set", async () => {
    // Its closed set is the table, and the foreign key is what closes it.
    // Judging against the fifty rows that happened to load would refuse the
    // very value being edited.
    //
    // The window is loaded here on purpose: without it the field resolves with
    // no options at all and would be let through for that reason instead,
    // which would prove nothing about relationships.
    const related = Schema.make([
      Select.make("authorId").relationship("author", "name"),
    ]);
    const tree = await resolveSchema(
      related,
      {},
      {
        operation: "create",
        loadOptions: () => Promise.resolve([{ value: "1", label: "Ada" }]),
      },
    );
    expect(tree.nodes.find((node) => node.id === "authorId")?.options).toHaveLength(1);

    const clean = sanitize(tree, { authorId: "40000" });

    expect(clean.state).toEqual({ authorId: "40000" });
  });

  it("closes a declared list even when something computed it", async () => {
    // The exemption is for relationships, not for every list that arrived by
    // way of a resolver.
    const computed = Schema.make([
      Select.make("rank").options(() => [{ value: "high", label: "High" }]),
    ]);

    const clean = sanitize(await treeOf(computed), { rank: "forged" });

    expect(clean.rejected).toEqual([{ path: "rank", reason: "undeclared-value" }]);
  });

  it("says nothing about any of it to the client", async () => {
    // Every refusal above is data for a log. The response carries the tree and
    // the errors, and `rejected` is on neither.
    const clean = sanitize(await treeOf(CHOICES), { status: "deleted" });

    expect(Object.keys(clean)).toEqual(["state", "rejected"]);
    expect(clean.state).toEqual({});
  });
});

describe("a select that declared nothing", () => {
  it("accepts nothing either, rather than everything", async () => {
    // Neither options nor a relation. A mistake in the form — and the boundary
    // must not turn a developer's mistake into a way in.
    const nothing = Schema.make([Select.make("status")]);

    const clean = sanitize(await resolveSchema(nothing, {}, { operation: "create" }), {
      status: "anything at all",
    });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "status", reason: "undeclared-value" }]);
  });

  it("can still be cleared, which asks nothing of any list", async () => {
    const nothing = Schema.make([Select.make("status")]);

    const clean = sanitize(await resolveSchema(nothing, {}, { operation: "create" }), {
      status: "",
    });

    expect(clean.state).toEqual({ status: "" });
  });
});
