/**
 * Pairs above, an object underneath.
 *
 * What the form holds and what the column holds are deliberately not the same
 * shape, so most of what is tested here is the conversion between them — and
 * that what comes out of a `Json` column nobody here wrote is something this
 * field would take back.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { KeyValue } from "./key-value.js";

const tree = (made = KeyValue.make("meta"), state: Record<string, unknown> = {}) =>
  resolveSchema(Schema.make([made]), state, { operation: "create" });

const refusal = async (value: unknown) =>
  sanitize(await tree(), { meta: value }).rejected[0]?.reason;

/** What an edit page does: the row in, the field's own shape out. */
const read = async (stored: unknown) =>
  serialise(
    await resolveSchema(
      Schema.make([KeyValue.make("meta")]),
      { meta: stored },
      { operation: "edit", record: { meta: stored } },
    ),
  ).state["meta"];

describe("what a key value field may hold", () => {
  it("pairs of text, in the order they were given", async () => {
    expect(
      sanitize(await tree(), {
        meta: [
          ["colour", "green"],
          ["size", "large"],
        ],
      }).state,
    ).toEqual({
      meta: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });
  });

  it("no rows at all, which is a reader clearing it", async () => {
    expect(sanitize(await tree(), { meta: [] }).state).toEqual({ meta: [] });
  });

  it("a blank value, because a key is what names the row", async () => {
    expect(sanitize(await tree(), { meta: [["colour", ""]] }).state).toEqual({
      meta: [["colour", ""]],
    });
  });

  it('a row nobody has typed into, which is what pressing "Add" gives', async () => {
    // Refused here, it would take the rest of the field with it: stage 5 drops
    // a refused path without a word, so a reader who asked for a row and had
    // not filled it in yet would lose every other row they had just edited.
    expect(
      sanitize(await tree(), {
        meta: [
          ["colour", "green"],
          ["", ""],
        ],
      }).state,
    ).toEqual({
      meta: [
        ["colour", "green"],
        ["", ""],
      ],
    });
  });

  it("a key with space around it, and the same key twice", async () => {
    // Both are things this page produces — a typed space, and two rows a
    // reader can see. What they mean is settled where the object is built.
    expect(await refusal([[" colour ", "green"]])).toBeUndefined();
    expect(
      await refusal([
        ["colour", "green"],
        ["colour", "blue"],
      ]),
    ).toBeUndefined();
  });

  it("nothing that is not a list of pairs", async () => {
    expect(await refusal({ colour: "green" })).toBe("wrong-shape");
    expect(await refusal("colour")).toBe("wrong-shape");
    expect(await refusal(["colour"])).toBe("wrong-shape");
    expect(await refusal([["colour", "green", "extra"]])).toBe("wrong-shape");
  });

  it("nothing that is not text on either side", async () => {
    expect(await refusal([["colour", 1]])).toBe("wrong-shape");
    expect(await refusal([[1, "green"]])).toBe("wrong-shape");
    expect(await refusal([["colour", null]])).toBe("wrong-shape");
  });
});

describe("the object the column keeps", () => {
  it("is written from the pairs, in their order", async () => {
    const resolved = await tree(KeyValue.make("meta"), {
      meta: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      meta: { colour: "green", size: "large" },
    });
  });

  it("is written with the keys trimmed, and without the rows that name nothing", async () => {
    const resolved = await tree(KeyValue.make("meta"), {
      meta: [
        [" colour ", "green"],
        ["", "nameless"],
        ["   ", "nor this"],
      ],
    });

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      meta: { colour: "green" },
    });
  });

  it("keeps the last of two rows sharing a name, which is what an object says", async () => {
    const resolved = await tree(KeyValue.make("meta"), {
      meta: [
        ["colour", "green"],
        ["colour", "blue"],
      ],
    });

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      meta: { colour: "blue" },
    });
  });

  it("keeps a pair named `__proto__`, which a plain object would swallow", async () => {
    // `out["__proto__"] = held` calls a setter instead of making a property:
    // the pair would go missing between the form and the row, silently.
    const resolved = await tree(KeyValue.make("meta"), {
      meta: [["__proto__", "green"]],
    });
    const written = dehydrate(resolved, { operation: "create", user: undefined }).set[
      "meta"
    ];

    expect(Object.keys(written as object)).toEqual(["__proto__"]);
    expect(JSON.stringify(written)).toBe('{"__proto__":"green"}');
  });

  it("is read back as the pairs it stands for", async () => {
    expect(await read({ colour: "green", size: "large" })).toEqual([
      ["colour", "green"],
      ["size", "large"],
    ]);
  });

  it("is read as no rows where it holds nothing", async () => {
    expect(await read({})).toEqual([]);
  });
});

describe("a column somebody else filled", () => {
  it("gives back only what this field would take", async () => {
    // A `Json` column is the one place a panel meets a shape nobody here
    // chose. What comes out has to be something the boundary accepts, or the
    // form cannot be saved until the reader finds the row at fault.
    const stored = { " colour ": "green", "": "nameless", colour: "blue", ok: "yes" };

    expect(await read(stored)).toEqual([
      ["colour", "green"],
      ["ok", "yes"],
    ]);

    const resolved = await resolveSchema(
      Schema.make([KeyValue.make("meta")]),
      { meta: stored },
      { operation: "edit", record: { meta: stored } },
    );

    expect(
      sanitize(resolved, { meta: serialise(resolved).state["meta"] }).rejected,
    ).toEqual([]);
  });

  it("shows an entry that is not text as the JSON it is", async () => {
    // Dropped, it would leave the page and then the column: the next save
    // writes the pairs and nothing else. Shown, it survives — at the price of
    // a number coming back as text.
    expect(await read({ size: 3, on: true, nested: { b: 1 } })).toEqual([
      ["size", "3"],
      ["on", "true"],
      ["nested", '{"b":1}'],
    ]);
  });

  it("is left alone where it is not an object at all", async () => {
    // Refusing something recognisable beats writing something invented: the
    // boundary will say so, rather than the field half-converting it.
    expect(await read("green")).toBe("green");
    expect(await read(null)).toBeNull();
  });
});

describe("what it tells the browser", () => {
  it("what its two columns are called", async () => {
    const node = serialise(
      await tree(KeyValue.make("meta").keyLabel("Setting").valueLabel("Reading")),
    ).schema.children?.[0];

    expect(node?.type).toBe("KeyValue");
    expect(node?.props?.["keyLabel"]).toBe("Setting");
    expect(node?.props?.["valueLabel"]).toBe("Reading");
  });

  it("nothing about either where neither was declared", async () => {
    const node = serialise(await tree()).schema.children?.[0];

    expect(node?.props?.["keyLabel"]).toBeUndefined();
    expect(node?.props?.["valueLabel"]).toBeUndefined();
  });
});

describe("a column named with nothing", () => {
  it("stops the boot, because a blank heading names nothing", () => {
    // The heading draws empty and each box under it is left named by the row
    // it is on. Declared, and naming nothing — the shape of mistake this
    // audit exists for.
    const complaints = auditSchema(
      Schema.make([KeyValue.make("meta").keyLabel("   ")]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("meta");
    expect(complaints[0]?.problem).toContain("keyLabel");
  });

  it("says so about either of the two", () => {
    expect(
      auditSchema(Schema.make([KeyValue.make("meta").valueLabel("")]))[0]?.problem,
    ).toContain("valueLabel");
  });
});
