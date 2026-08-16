import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { TextInput } from "./text-input.js";
import { MAX_ROW_KEY_LENGTH, Repeater } from "./repeater.js";

const rows = (made = Repeater.make("items")) =>
  resolveSchema(Schema.make([made]), {}, { operation: "create" });

const refusal = async (value: unknown, made?: Repeater) =>
  sanitize(await rows(made), { items: value }).rejected[0]?.reason;

describe("what a repeater may hold", () => {
  it("an ordered list of keys, which is what it is", async () => {
    expect(sanitize(await rows(), { items: ["r1", "r2"] }).state).toEqual({
      items: ["r1", "r2"],
    });
  });

  it("an empty list, which is a repeater with no rows", async () => {
    expect(sanitize(await rows(), { items: [] }).state).toEqual({ items: [] });
  });

  it("nothing that is not a list", async () => {
    expect(await refusal("r1")).toBe("wrong-shape");
    expect(await refusal(3)).toBe("wrong-shape");
    expect(await refusal({ r1: {} })).toBe("wrong-shape");
  });

  it("no key that is not text", async () => {
    expect(await refusal([1, 2])).toBe("wrong-shape");
    expect(await refusal([{ id: "r1" }])).toBe("wrong-shape");
  });

  it("no key that names nothing", async () => {
    expect(await refusal([""])).toBe("wrong-shape");
  });

  it("no key long enough to be a payload of its own", async () => {
    // It is a map key, a path segment and a piece of every payload the row
    // appears in. A client that may invent paths does not also get to decide
    // how much of a request one of them takes.
    expect(await refusal(["x".repeat(MAX_ROW_KEY_LENGTH + 1)])).toBe("wrong-shape");
    expect(
      sanitize(await rows(), { items: ["x".repeat(MAX_ROW_KEY_LENGTH)] }).rejected,
    ).toEqual([]);
  });

  it("no key twice, which would be one row written over itself", async () => {
    expect(await refusal(["r1", "r2", "r1"])).toBe("undeclared-value");
  });

  it("and lets itself be cleared", async () => {
    expect(sanitize(await rows(), { items: "" }).rejected).toEqual([]);
  });
});

describe("more rows than a field allows", () => {
  const bounded = Repeater.make("items").maxItems(2);

  it("is refused at the boundary, not only judged afterwards", async () => {
    // A rejected value is still a value the tree gets resolved from. Ten
    // thousand keys would build ten thousand sub-trees before anything got
    // round to complaining.
    expect(await refusal(["a", "b", "c"], bounded)).toBe("undeclared-value");
  });

  it("is fine right up to the limit", async () => {
    expect(sanitize(await rows(bounded), { items: ["a", "b"] }).rejected).toEqual([]);
  });

  it("is unbounded where no field said otherwise", async () => {
    const many = Array.from({ length: 500 }, (_, i) => `r${String(i)}`);

    expect(sanitize(await rows(), { items: many }).rejected).toEqual([]);
  });
});

describe("what it says when there are too few or too many", () => {
  const ruled = async (made: Repeater, value: unknown) => {
    const tree = await resolveSchema(
      Schema.make([made]),
      { items: value },
      {
        operation: "create",
      },
    );
    return tree.errors["items"];
  };

  it("names the floor, in words a reader can act on", async () => {
    expect(await ruled(Repeater.make("items").minItems(2), ["a"])).toBe(
      "Add at least 2 rows.",
    );
  });

  it("names the ceiling to whoever gets a list past the boundary", async () => {
    // Which, through the boundary, is nobody: see the test below. Kept because
    // a rule declared in one of the two places and not the other is how the
    // two drift apart.
    expect(await ruled(Repeater.make("items").maxItems(1), ["a", "b"])).toBe(
      "Keep this to 1 row.",
    );
  });

  it("says nothing where the count is right", async () => {
    const made = Repeater.make("items").minItems(1).maxItems(3);

    expect(await ruled(made, ["a", "b"])).toBeUndefined();
  });

  it("counts an unset repeater as none rather than as unknown", async () => {
    expect(await ruled(Repeater.make("items").minItems(1), undefined)).toBe(
      "Add at least 1 row.",
    );
  });
});

describe("a repeater somebody has to fill in", () => {
  it("is not filled in by having no rows", async () => {
    const tree = await resolveSchema(
      Schema.make([Repeater.make("items").required()]),
      { items: [] },
      { operation: "create" },
    );

    expect(tree.errors["items"]).toBeDefined();
  });

  it("is filled in by having one", async () => {
    const tree = await resolveSchema(
      Schema.make([Repeater.make("items").required()]),
      { items: ["r1"] },
      { operation: "create" },
    );

    expect(tree.errors["items"]).toBeUndefined();
  });
});

describe("the fields one row holds", () => {
  it("are its children, set the way every layout sets them", () => {
    // A row is a section that happens many times, so it takes the `.schema([])`
    // that already exists rather than one of its own.
    const made = Repeater.make("items").schema([TextInput.make("label")]);

    expect(made.state.children).toHaveLength(1);
  });

  it("do not follow it into the copy a later call makes", () => {
    const made = Repeater.make("items").schema([TextInput.make("label")]);

    expect(made.maxItems(2).state.children).toHaveLength(1);
    expect(made.state.maxItems).toBeUndefined();
  });
});

describe("what a reader actually meets at the ceiling", () => {
  it("loses the rows rather than being told, which is what silence costs", async () => {
    // Measured rather than assumed. The boundary refuses the whole list, so
    // the accepted state holds no rows at all — not the ones that were there
    // before — and the rule judges that state, so it reports nothing.
    //
    // Invariant 4 is why it is silent, and the client is what keeps anybody
    // from arriving here: it stops offering another row at the limit. A
    // request that gets past it was not written by this panel.
    const made = Repeater.make("items")
      .maxItems(2)
      .schema([TextInput.make("label")]);
    const settled = await resolveSchema(
      Schema.make([made]),
      { items: ["a", "b"] },
      {
        operation: "create",
      },
    );

    const clean = sanitize(settled, { items: ["a", "b", "c"] });
    expect(clean.rejected).toEqual([{ path: "items", reason: "undeclared-value" }]);
    expect(clean.state["items"]).toBeUndefined();

    const next = await resolveSchema(Schema.make([made]), clean.state, {
      operation: "create",
    });
    expect(next.errors["items"]).toBeUndefined();
  });
});

describe("a repeater with nothing to repeat", () => {
  it("stops the boot rather than adding blank rows", () => {
    expect(auditSchema(Schema.make([Repeater.make("items")]))).toEqual([
      {
        field: "items",
        problem: "has nothing to repeat, so every row it added would be blank",
      },
    ]);
  });

  it("says nothing once it has fields", () => {
    const made = Repeater.make("items").schema([TextInput.make("label")]);

    expect(auditSchema(Schema.make([made]))).toEqual([]);
  });
});
