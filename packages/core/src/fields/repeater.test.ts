import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
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

describe("what identifies a node inside a row", () => {
  const ids = (node: { id: string; children: readonly { id: string }[] }) =>
    node.children.map((child) => child.id);

  it("tells one row's keyed child from the next one's", async () => {
    // A key is a stable identity for the client diff. Inside a repeater every
    // row is walked from the same declaration, so a key written once was the
    // id of every row's copy — and the renderer keys React by it, which makes
    // two siblings with one key.
    const tree = await resolveSchema(
      Schema.make([
        Repeater.make("items").schema([TextInput.make("label").key("theLabel")]),
      ]),
      { items: ["r1", "r2"] },
      { operation: "create" },
    );

    const repeater = tree.root.children[0];
    expect(new Set(ids(repeater!)).size).toBe(2);
  });

  it("keeps a key at the top of a form exactly as it was written", async () => {
    // Only a row namespaces one. Everywhere else the key is the id, which is
    // what makes it worth writing.
    const tree = await resolveSchema(
      Schema.make([TextInput.make("title").key("theTitle")]),
      {},
      { operation: "create" },
    );

    expect(tree.root.children[0]?.id).toBe("theTitle");
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
    // State the tree does not account for is refused in silence, and the client
    // is what keeps anybody from arriving here: it stops offering another row
    // at the limit. A
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

describe("the rows the state names", () => {
  const made = () =>
    Repeater.make("items").schema([TextInput.make("label"), TextInput.make("note")]);

  const resolved = async (state: Record<string, unknown>) =>
    await resolveSchema(Schema.make([made()]), state, { operation: "create" });

  it("is one sub-tree per key, in the order the list gives", async () => {
    const tree = await resolved({ items: ["r1", "r2"] });
    const paths = tree.nodes
      .filter((node) => node.path !== "" && node.path !== "items")
      .map((node) => node.path);

    expect(paths).toEqual([
      "items.r1.label",
      "items.r1.note",
      "items.r2.label",
      "items.r2.note",
    ]);
  });

  it("is nothing at all where the list is empty", async () => {
    const tree = await resolved({ items: [] });

    expect(tree.nodes.filter((node) => node.path.startsWith("items."))).toEqual([]);
  });

  it("is nothing where the value is not a list, rather than throwing", async () => {
    // The walk runs before the boundary judges: it has to survive whatever the
    // state holds, because building the tree is how the boundary gets one.
    const tree = await resolved({ items: "not a list" });

    expect(tree.nodes.filter((node) => node.path.startsWith("items."))).toEqual([]);
  });

  it("follows the list when a row is dropped", async () => {
    const tree = await resolved({ items: ["r2"] });
    const paths = tree.nodes
      .map((node) => node.path)
      .filter((p) => p.startsWith("items."));

    expect(paths).toEqual(["items.r2.label", "items.r2.note"]);
  });

  it("keeps a row's values on that row when the order changes", async () => {
    // The whole reason the key is stable rather than an index: reordering
    // moves no path, so nothing lands on the neighbouring row.
    const state = {
      items: ["r2", "r1"],
      "items.r1.label": "first",
      "items.r2.label": "second",
    };
    const tree = await resolved(state);
    const values = tree.nodes
      .filter((node) => node.path.endsWith(".label"))
      .map((node) => [node.path, tree.state[node.path]]);

    expect(values).toEqual([
      ["items.r2.label", "second"],
      ["items.r1.label", "first"],
    ]);
  });

  it("stops at the ceiling even where nothing has judged the list yet", async () => {
    // The guarantee is local rather than the caller's discipline: whoever
    // resolves, a list past the limit does not build sub-trees past it.
    const bounded = Repeater.make("items")
      .maxItems(2)
      .schema([TextInput.make("label")]);
    const many = Array.from({ length: 500 }, (_, i) => `r${String(i)}`);
    const tree = await resolveSchema(
      Schema.make([bounded]),
      { items: many },
      {
        operation: "create",
      },
    );

    expect(tree.nodes.filter((node) => node.path.startsWith("items."))).toHaveLength(2);
  });
});

describe("a row's fields at the boundary", () => {
  const made = Repeater.make("items").schema([TextInput.make("label")]);

  it("are admitted once the list naming them has been", async () => {
    const tree = await resolveSchema(
      Schema.make([made]),
      { items: ["r1"] },
      {
        operation: "create",
      },
    );

    expect(sanitize(tree, { "items.r1.label": "Intro" }).state).toEqual({
      "items.r1.label": "Intro",
    });
  });

  it("are refused for a row the list never named", async () => {
    // The path does not exist, so it is refused by the rule that refuses every
    // path nobody declared. Nothing about repeaters was added to say so.
    const tree = await resolveSchema(
      Schema.make([made]),
      { items: ["r1"] },
      {
        operation: "create",
      },
    );

    expect(sanitize(tree, { "items.smuggled.label": "x" }).rejected).toEqual([
      { path: "items.smuggled.label", reason: "unknown-path" },
    ]);
  });

  it("are refused for a field the row does not have", async () => {
    const tree = await resolveSchema(
      Schema.make([made]),
      { items: ["r1"] },
      {
        operation: "create",
      },
    );

    expect(sanitize(tree, { "items.r1.secret": "x" }).rejected).toEqual([
      { path: "items.r1.secret", reason: "unknown-path" },
    ]);
  });
});

describe("what a repeater writes", () => {
  const made = () =>
    Repeater.make("items")
      .relationship("sections")
      // Two fields, deliberately. With one, a row and a field are the same
      // thing — and every test below passes while each field writes its own
      // row, which is what happened.
      .schema([TextInput.make("label"), TextInput.make("note")]);

  const written = async (
    state: Record<string, unknown>,
    record?: Record<string, unknown>,
  ) => {
    const options = {
      operation: "edit" as const,
      ...(record === undefined ? {} : { record }),
    };
    const tree = await resolveSchema(Schema.make([made()]), state, options);
    return dehydrate(tree, options);
  };

  it("names the relation it was told to write, not the field", async () => {
    const out = await written({ items: ["r1"], "items.r1.label": "Intro" });

    expect(Object.keys(out.relations ?? {})).toEqual(["sections"]);
  });

  it("creates a row the record never had", async () => {
    const out = await written({ items: ["new1"], "items.new1.label": "Intro" });

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { label: "Intro" } }],
    });
  });

  it("writes one row per key, however many fields the row holds", async () => {
    const out = await written({
      items: ["r1"],
      "items.r1.label": "Intro",
      "items.r1.note": "hello",
    });

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { label: "Intro", note: "hello" } }],
    });
  });

  it("keeps two rows apart, field for field", async () => {
    const out = await written({
      items: ["a", "b"],
      "items.a.label": "First",
      "items.a.note": "one",
      "items.b.label": "Second",
      "items.b.note": "two",
    });

    expect(out.relations?.["sections"]).toEqual({
      create: [
        { set: { label: "First", note: "one" } },
        { set: { label: "Second", note: "two" } },
      ],
    });
  });

  it("updates a row the record did have, by the id it was loaded with", async () => {
    const record = { sections: [{ id: 7, label: "Old" }] };
    const out = await written({ items: ["7"], "items.7.label": "New" }, record);

    expect(out.relations?.["sections"]).toEqual({
      update: [{ id: 7, data: { set: { label: "New" } } }],
    });
  });

  it("deletes a row the record has and the list does not", async () => {
    const record = {
      sections: [
        { id: 7, label: "Old" },
        { id: 8, label: "Other" },
      ],
    };
    const out = await written({ items: ["7"], "items.7.label": "Old" }, record);

    expect(out.relations?.["sections"]).toEqual({
      update: [{ id: 7, data: { set: { label: "Old" } } }],
      delete: [8],
    });
  });

  it("creates rather than updates for a key that resembles somebody's id", async () => {
    // Decision 4: what a key means is decided by the record, never by the key.
    // A client inventing "7" against a record that loaded no such child makes
    // a row; it cannot reach one.
    const record = { sections: [{ id: 99, label: "Theirs" }] };
    const out = await written({ items: ["7"], "items.7.label": "Mine" }, record);

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { label: "Mine" } }],
      delete: [99],
    });
  });

  it("creates every row where the record loaded none at all", async () => {
    const out = await written(
      { items: ["1", "2"], "items.1.label": "a", "items.2.label": "b" },
      {
        sections: undefined,
      },
    );

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { label: "a" } }, { set: { label: "b" } }],
    });
  });

  it("keeps a row's own fields out of the parent's columns", async () => {
    const out = await written({ items: ["r1"], "items.r1.label": "Intro" });

    expect(out.set).toEqual({});
  });

  it("says nothing about a relation where the repeater was never filled", async () => {
    const out = await written({});

    expect(out.relations?.["sections"]).toEqual({});
  });
});

describe("where a loaded row keeps its key", () => {
  const write = async (
    made: Repeater,
    state: Record<string, unknown>,
    record: Record<string, unknown>,
  ) => {
    const options = { operation: "edit" as const, record };
    return dehydrate(await resolveSchema(Schema.make([made]), state, options), options);
  };

  const keyed = (rowKey?: string) => {
    const made = Repeater.make("items")
      .relationship("sections")
      .schema([TextInput.make("label")]);
    return rowKey === undefined ? made : made.rowKey(rowKey);
  };

  it("is `id` where nothing says otherwise", async () => {
    const out = await write(
      keyed(),
      { items: ["7"], "items.7.label": "New" },
      {
        sections: [{ id: 7, label: "Old" }],
      },
    );

    expect(out.relations?.["sections"]).toEqual({
      update: [{ id: 7, data: { set: { label: "New" } } }],
    });
  });

  it("is whatever the field named", async () => {
    const out = await write(
      keyed("uuid"),
      { items: ["abc"], "items.abc.label": "New" },
      {
        sections: [{ uuid: "abc", label: "Old" }],
      },
    );

    expect(out.relations?.["sections"]).toEqual({
      update: [{ id: "abc", data: { set: { label: "New" } } }],
    });
  });

  it("stops the save when the rows have no such key at all", async () => {
    // Left alone this is silent: every row becomes a create, so the save
    // duplicates the relation instead of editing it — once per save, for as
    // long as nobody counts the rows.
    await expect(
      write(keyed(), { items: ["abc"] }, { sections: [{ uuid: "abc", label: "Old" }] }),
    ).rejects.toThrow(/have no `id`/);
  });

  it("says nothing where the relation came back empty, which is not a mismatch", async () => {
    const out = await write(
      keyed(),
      { items: ["new"], "items.new.label": "a" },
      {
        sections: [],
      },
    );

    expect(out.relations?.["sections"]).toEqual({ create: [{ set: { label: "a" } }] });
  });
});

describe("a rule inside a row", () => {
  const made = () =>
    Repeater.make("items")
      .relationship("sections")
      .schema([TextInput.make("label").required()]);

  const errorsFor = async (state: Record<string, unknown>) =>
    (await resolveSchema(Schema.make([made()]), state, { operation: "create" })).errors;

  it("is reported against the row it is about", async () => {
    // Keyed on the field's declared name, every row collapses onto one error —
    // reported at a path that holds nothing, so it fires for rows that are
    // perfectly filled in and never for the row that is not.
    const errors = await errorsFor({
      items: ["a", "b"],
      "items.a.label": "Filled",
      "items.b.label": "",
    });

    expect(errors).toEqual({ "items.b.label": "This field is required." });
  });

  it("says nothing where every row is filled", async () => {
    const errors = await errorsFor({
      items: ["a", "b"],
      "items.a.label": "One",
      "items.b.label": "Two",
    });

    expect(errors).toEqual({});
  });

  it("reports each row that needs it, not just the first", async () => {
    const errors = await errorsFor({ items: ["a", "b"], "items.a.label": "" });

    expect(Object.keys(errors).sort()).toEqual(["items.a.label", "items.b.label"]);
  });
});

describe("the rows a record already has", () => {
  const made = () =>
    Repeater.make("items")
      .relationship("sections")
      .schema([TextInput.make("label")]);

  const loaded = async (record: Record<string, unknown>, state = {}) =>
    await resolveSchema(Schema.make([made()]), state, { operation: "edit", record });

  it("are on the form without the client having asked for them", async () => {
    // Without this the form shows no rows, so the client sends none back, and
    // the save reads that as an instruction to delete every one of them.
    const tree = await loaded({ sections: [{ id: 1, label: "First" }] });

    expect(tree.state["items"]).toEqual(["1"]);
    expect(tree.state["items.1.label"]).toBe("First");
  });

  it("give way to what the client sent, once it has sent anything", async () => {
    // An empty list from a client is a reader who removed the rows, not a
    // client that has not spoken yet.
    const tree = await loaded({ sections: [{ id: 1, label: "First" }] }, { items: [] });

    expect(tree.state["items"]).toEqual([]);
  });

  it("are nothing where the record carries no such relation", async () => {
    const tree = await loaded({ id: 1 });

    expect(tree.state["items"]).toBeUndefined();
  });
});

describe("the rows a record has one level further down", () => {
  const nested = () =>
    Schema.make([
      Repeater.make("items")
        .relationship("sections")
        .schema([
          TextInput.make("label"),
          Repeater.make("blocks").schema([TextInput.make("body")]),
        ]),
    ]);

  const RECORD = {
    id: 1,
    sections: [{ id: 10, label: "First", blocks: [{ id: 100, body: "Kept" }] }],
  };

  it("are on the form, like the ones a level above", async () => {
    const tree = await resolveSchema(
      nested(),
      {},
      { operation: "edit", record: RECORD },
    );

    expect(tree.state["items.10.blocks"]).toEqual(["100"]);
    expect(tree.state["items.10.blocks.100.body"]).toBe("Kept");
  });

  it("survive a save the client made no mention of them in", async () => {
    // The same loss as one level up, and just as quiet: the form shows none of
    // them, the client sends none back, and the write says delete every one.
    const options = { operation: "edit", record: RECORD } as const;
    const tree = await resolveSchema(nested(), {}, options);
    const write = dehydrate(tree, options);

    const rows = write.relations?.["sections"]?.update?.[0]?.data.relations?.["blocks"];
    expect(rows?.delete ?? []).toEqual([]);
  });

  it("leave no state behind on a row the reader removed", async () => {
    // The list is the reader's. Seeding a row they took out would put values
    // under a key the tree builds no node for — state nothing claims.
    const tree = await resolveSchema(
      nested(),
      { items: [] },
      { operation: "edit", record: RECORD },
    );

    expect(Object.keys(tree.state).some((path) => path.startsWith("items.10"))).toBe(
      false,
    );
  });

  it("give way to what the client sent about them, like any other row", async () => {
    const tree = await resolveSchema(
      nested(),
      { items: ["10"], "items.10.blocks": [] },
      { operation: "edit", record: RECORD },
    );

    expect(tree.state["items.10.blocks"]).toEqual([]);
  });
});

describe("a row somebody added and never filled", () => {
  const made = () =>
    Repeater.make("items")
      .relationship("sections")
      .schema([TextInput.make("label"), TextInput.make("note")]);

  const written = async (
    state: Record<string, unknown>,
    record?: Record<string, unknown>,
  ) => {
    const options = {
      operation: "edit" as const,
      ...(record === undefined ? {} : { record }),
    };
    return dehydrate(
      await resolveSchema(Schema.make([made()]), state, options),
      options,
    );
  };

  it("is not written, so changing your mind costs nothing", async () => {
    // Written, it makes a child of nothing that the reader then has to find
    // and delete.
    const out = await written({ items: ["fresh"] });

    expect(out.relations?.["sections"]).toEqual({});
  });

  it("is not written even beside a row that was filled", async () => {
    const out = await written({ items: ["a", "blank"], "items.a.label": "Kept" });

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { label: "Kept" } }],
    });
  });

  it("is written as soon as any one of its fields has something", async () => {
    const out = await written({ items: ["fresh"], "items.fresh.note": "just this" });

    expect(out.relations?.["sections"]).toEqual({
      create: [{ set: { note: "just this" } }],
    });
  });

  it("is a different matter for a row the record already has", async () => {
    // Emptying an existing row is an edit, not an absence: it is written, and
    // the row stays.
    const record = { sections: [{ id: 7, label: "Was here" }] };
    const out = await written({ items: ["7"], "items.7.label": "" }, record);

    expect(out.relations?.["sections"]).toEqual({
      update: [{ id: 7, data: { set: { label: "" } } }],
    });
  });
});

describe("what one row is called", () => {
  const named = (label: Parameters<Repeater["itemLabel"]>[0]) =>
    Repeater.make("items")
      .schema([TextInput.make("body")])
      .itemLabel(label);

  const labels = async (made: Repeater, state: Record<string, unknown>) =>
    (await resolveSchema(Schema.make([made]), state, { operation: "edit" })).nodes.find(
      (node) => node.path === "items",
    )?.itemLabels;

  it("reads that row's fields by their own names", async () => {
    // The author cannot write the absolute path: the key that would complete
    // it is invented when the row is added.
    const made = named(({ get }) => String(get("body")));

    expect(
      await labels(made, {
        items: ["a", "b"],
        "items.a.body": "First",
        "items.b.body": "Second",
      }),
    ).toEqual({ a: "First", b: "Second" });
  });

  it("is resolved once per row, so two rows differ", async () => {
    const made = named(({ get }) => `#${String(String(get("body")).length)}`);

    expect(
      await labels(made, {
        items: ["a", "b"],
        "items.a.body": "xx",
        "items.b.body": "xxxx",
      }),
    ).toEqual({ a: "#2", b: "#4" });
  });

  it("takes a plain string as readily as a resolver", async () => {
    expect(await labels(named("Note"), { items: ["a"] })).toEqual({ a: "Note" });
  });

  it("says nothing for a row it named with nothing", async () => {
    // An empty label is not a label; a row falls back to its position.
    const made = named(({ get }) => (get("body") === undefined ? "" : "named"));

    expect(await labels(made, { items: ["a"] })).toEqual({});
  });

  it("is absent entirely where no field asked for one", async () => {
    const made = Repeater.make("items").schema([TextInput.make("body")]);

    expect(await labels(made, { items: ["a"] })).toBeUndefined();
  });
});

describe("a repeater always asks the server", () => {
  const wire = async () => {
    const made = Repeater.make("items").schema([TextInput.make("label")]);
    return serialise(
      await resolveSchema(Schema.make([made]), {}, { operation: "create" }),
    );
  };

  it("says so on the wire without anybody having declared it", async () => {
    // Not a preference. Its value is what says which rows exist, so a row
    // added without a round trip is a row the tree has never heard of — drawn
    // with no fields in it, for as long as nothing else on the form asks.
    expect((await wire()).schema.children?.[0]?.live).toEqual({
      debounce: 0,
      onBlur: false,
    });
  });

  it("commits at once, because adding a row is a decision and not typing", async () => {
    expect((await wire()).schema.children?.[0]?.live?.debounce).toBe(0);
  });
});
