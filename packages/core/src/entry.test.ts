/**
 * What an entry is, and what it deliberately is not.
 *
 * Each of these is a decision about infolists turned into an assertion. The
 * one that matters most is the third: a tree of entries admits nothing, and
 * it does so because there is no field in it for the boundary's map to hold —
 * not because a rule was written to refuse infolists.
 */
import { describe, expect, it } from "vitest";
import { auditInfolist, auditSchema } from "./audit.js";
import { Section, Schema } from "./layout.js";
import { Repeater } from "./fields/repeater.js";
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

describe("how a value is said to be read", () => {
  const props = async (entry: TextEntry) =>
    serialise(await read(Schema.make([entry]))).schema.children?.[0]?.props;

  it("says nothing where nothing was declared", async () => {
    expect(await props(TextEntry.make("title"))).toBeUndefined();
  });

  it("carries the zone with the rule, so the browser can apply both", async () => {
    expect(
      await props(TextEntry.make("title").dateTime({ timezone: "Europe/Paris" })),
    ).toEqual({ format: "dateTime", timezone: "Europe/Paris" });
  });

  it("keeps a decimals of zero, which a falsy check would have dropped", async () => {
    expect(await props(TextEntry.make("title").numeric({ decimals: 0 }))).toEqual({
      format: "numeric",
      decimals: 0,
    });
  });

  it("takes the settings of the format it replaced with it", async () => {
    // Measured before this: the amount went out carrying `Europe/Paris`.
    // Harmless to a renderer that reads only what the format calls for, and a
    // lie to anybody reading the payload to see what this entry was told to do.
    expect(
      await props(
        TextEntry.make("total").dateTime({ timezone: "Europe/Paris" }).money("EUR"),
      ),
    ).toEqual({ format: "money", currency: "EUR" });
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

describe("an entry somebody put inside a repeater", () => {
  it("stops the boot, rather than showing the parent's value on every row", () => {
    // Measured before this existed: it resolved to the record's own `title` on
    // every row, which is a value a reader can see and nothing would report.
    const complaints = auditSchema(
      Schema.make([
        Repeater.make("items")
          .relationship("rows")
          .schema([TextEntry.make("title")]),
      ]),
    );

    expect(complaints).toEqual([
      { field: "title", problem: expect.stringContaining("read the record rather") },
    ]);
  });

  it("says nothing about an entry that is not in one", () => {
    expect(auditSchema(Schema.make([TextEntry.make("title")]))).toEqual([]);
  });
});

describe("a field somebody put in an infolist", () => {
  it("stops the boot, because nothing on that page could ever save it", () => {
    // Measured before this existed: it drew an editable box, empty — the View
    // page sends no state — that a reader can type into and nothing collects.
    const complaints = auditInfolist(
      Schema.make([TextEntry.make("title"), TextInput.make("title")]),
    );

    expect(complaints).toEqual([
      { field: "title", problem: expect.stringContaining("field in an infolist") },
    ]);
  });

  it("finds one nested in a layout, which is where it would actually be", () => {
    const complaints = auditInfolist(
      Schema.make([Section.make("Details").schema([TextInput.make("title")])]),
    );

    expect(complaints.length).toBe(1);
  });

  it("says nothing about an infolist made of entries", () => {
    expect(
      auditInfolist(Schema.make([Section.make("D").schema([TextEntry.make("title")])])),
    ).toEqual([]);
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
