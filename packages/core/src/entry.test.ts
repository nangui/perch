/**
 * What an entry is, and what it deliberately is not.
 *
 * Each of these is a decision about infolists turned into an assertion. The
 * one that matters most is the third: a tree of entries admits nothing, and
 * it does so because there is no field in it for the boundary's map to hold —
 * not because a rule was written to refuse infolists.
 */
import { describe, expect, it } from "vitest";
import { Section, Schema } from "./layout.js";
import { Entry } from "./entry.js";
import { TextEntry } from "./entries/text-entry.js";
import { Field } from "./field.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";
import { serialise } from "./serialise.js";

const RECORD = {
  id: 1,
  title: "Ada",
  customer: { email: "ada@example.com", address: null },
};

const read = async (schema: ReturnType<typeof Schema.make>) =>
  await resolveSchema(schema, {}, { operation: "view", record: RECORD });

describe("an entry", () => {
  it("is not a field, which is what keeps every field behaviour away from it", () => {
    const entry = TextEntry.make("title");

    expect(entry).toBeInstanceOf(Entry);
    expect(entry).not.toBeInstanceOf(Field);
  });

  it("clones on every fluent call, like everything else in the tree", () => {
    const plain = TextEntry.make("title");
    const with_ = plain.label("Headline");

    expect(with_).not.toBe(plain);
    expect(plain.state.label).toBeUndefined();
  });
});

describe("what an entry shows", () => {
  it("is what the record holds at the path it named", async () => {
    const tree = await read(Schema.make([TextEntry.make("title")]));

    expect(tree.nodes.find((n) => n.component.type === "TextEntry")?.value).toBe("Ada");
  });

  it("reaches through a relation the record carried", async () => {
    const tree = await read(Schema.make([TextEntry.make("customer.email")]));

    expect(tree.nodes.find((n) => n.component.type === "TextEntry")?.value).toBe(
      "ada@example.com",
    );
  });

  it("is nothing where the path stops at a null, rather than throwing", async () => {
    // A customer with no address is ordinary. A page that dies over it is not.
    const tree = await read(Schema.make([TextEntry.make("customer.address.city")]));

    expect(
      tree.nodes.find((n) => n.component.type === "TextEntry")?.value,
    ).toBeUndefined();
  });

  it("says what to show where the record has nothing", async () => {
    // The difference between "empty" and "this page is broken". Without it an
    // absent value is a gap in the layout that says neither.
    const tree = await read(
      Schema.make([TextEntry.make("customer.address.city").placeholder("Not given")]),
    );

    expect(serialise(tree).schema.children?.[0]?.placeholder).toBe("Not given");
  });

  it("resolves that against the record, like every other resolvable", async () => {
    const tree = await read(
      Schema.make([
        TextEntry.make("missing").placeholder(
          ({ record }) => `No ${String(record?.["title"])}`,
        ),
      ]),
    );

    expect(serialise(tree).schema.children?.[0]?.placeholder).toBe("No Ada");
  });

  it("never lands in the state map, which is the map a client may write to", async () => {
    const tree = await read(Schema.make([TextEntry.make("title")]));

    expect(tree.state).toEqual({});
  });
});

describe("an infolist at the trust boundary", () => {
  const infolist = Schema.make([
    Section.make("Details").schema([
      TextEntry.make("title"),
      TextEntry.make("customer.email"),
    ]),
  ]);

  it("admits nothing at all, whatever is sent at it", async () => {
    const tree = await read(infolist);

    const { state, rejected } = sanitize(tree, {
      title: "forged",
      "customer.email": "forged",
    });

    expect(state).toEqual({});
    // The reason, not only the refusal. Both paths are unknown because an entry
    // is never in the map the boundary matches against — if these ever came
    // back "server-owned" instead, an entry would be in that map and refused by
    // a flag, which is one rename away from not being refused at all.
    expect(rejected).toEqual([
      { path: "title", reason: "unknown-path" },
      { path: "customer.email", reason: "unknown-path" },
    ]);
  });

  it("writes nothing, because there is nothing in it to dehydrate", async () => {
    const tree = await read(infolist);

    expect(dehydrate(tree, { operation: "view", record: RECORD }).set).toEqual({});
  });
});

describe("an entry on the wire", () => {
  it("carries its value on the node, never in the state", async () => {
    const tree = await read(Schema.make([TextEntry.make("title")]));

    const payload = serialise(tree);

    expect(payload.schema.children?.[0]?.value).toBe("Ada");
    expect(payload.state).toEqual({});
  });

  it("has no state path, because it names a place in the record", async () => {
    const tree = await read(Schema.make([TextEntry.make("customer.email")]));

    expect(serialise(tree).schema.children?.[0]?.path).toBeUndefined();
  });

  it("is absent entirely when it is not visible", async () => {
    // The leak invariant, and it needs no rule of its own: a node the tree does
    // not carry had no value read for it, so there is nothing to omit.
    const tree = await read(Schema.make([TextEntry.make("title").hidden()]));

    expect(serialise(tree).schema.children ?? []).toEqual([]);
  });
});

describe("the layouts, in both trees", () => {
  it("are the same class doing the same thing", async () => {
    const section = Section.make("Details").columns(2);

    const form = await resolveSchema(
      Schema.make([section.schema([TextInput.make("title")])]),
      {},
      {
        operation: "edit",
        record: RECORD,
      },
    );
    const infolist = await read(
      Schema.make([section.schema([TextEntry.make("title")])]),
    );

    const of = (tree: typeof form) => serialise(tree).schema.children?.[0];
    expect(of(form)?.type).toBe(of(infolist)?.type);
    expect(of(form)?.props).toEqual(of(infolist)?.props);
    expect(of(form)?.label).toBe(of(infolist)?.label);
  });
});
