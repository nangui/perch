/**
 * A box that says something, and the line of prose it says it with.
 *
 * The prose is the part worth testing here. A description has been declarable
 * since the first `Section` and reached the browser in none of them: the value
 * is resolvable, and only static props were copied onto the payload.
 */
import { describe, expect, it } from "vitest";
import { auditInfolist, auditSchema } from "./audit.js";
import { Callout, Fieldset, Schema, Section, Tab, Tabs } from "./layout.js";
import { TextInput } from "./fields/text-input.js";
import { resolveSchema } from "./resolve.js";
import { serialise } from "./serialise.js";

const drawn = async (
  schema: Schema,
  state: Record<string, unknown> = {},
): Promise<ReturnType<typeof serialise>> =>
  serialise(await resolveSchema(schema, state, { operation: "create" }));

describe("what a callout carries", () => {
  it("its heading, its tone and what it says", async () => {
    const payload = await drawn(
      Schema.make([
        Callout.make("Careful").tone("warning").description("This cannot be undone."),
      ]),
    );
    const box = payload.schema.children?.[0];

    expect(box?.type).toBe("Callout");
    expect(box?.label).toBe("Careful");
    expect(box?.props?.["tone"]).toBe("warning");
    expect(box?.description).toBe("This cannot be undone.");
  });

  it("a sentence worked out from what the reader has typed", async () => {
    // Resolvable, because the line a reader needs usually depends on what is
    // in front of them. Copied from the state it would ship the function.
    const payload = await drawn(
      Schema.make([
        TextInput.make("role"),
        Callout.make().description(({ get }) => `You picked ${String(get("role"))}.`),
      ]),
      { role: "lead" },
    );

    expect(payload.schema.children?.[1]?.description).toBe("You picked lead.");
  });

  it("whatever it is about, so the warning and the fields read as one thing", async () => {
    const payload = await drawn(
      Schema.make([Callout.make("Careful").schema([TextInput.make("confirm")])]),
    );

    expect(payload.schema.children?.[0]?.children?.[0]?.path).toBe("confirm");
  });
});

describe("the mark beside a title", () => {
  it("can be declared on a callout, which serialised one it could not set", async () => {
    // Written twice — once on a section, once on a tab — and on the base
    // neither time, so the wire promised a prop the type system forbade.
    const payload = await drawn(Schema.make([Callout.make("Careful").icon("!")]));

    expect(payload.schema.children?.[0]?.props?.["icon"]).toBe("!");
  });

  it("is still there on the two that always had it", async () => {
    const section = await drawn(Schema.make([Section.make("Identity").icon("*")]));
    const tabs = await drawn(
      Schema.make([Tabs.make().tabs([Tab.make("About").icon("+")])]),
    );

    expect(section.schema.children?.[0]?.props?.["icon"]).toBe("*");
    expect(tabs.schema.children?.[0]?.children?.[0]?.props?.["icon"]).toBe("+");
  });
});

describe("a section's own description", () => {
  it("reaches the browser, which it never did before", async () => {
    const payload = await drawn(
      Schema.make([Section.make("Identity").description("Who they are.")]),
    );

    expect(payload.schema.children?.[0]?.description).toBe("Who they are.");
  });
});

describe("where a callout may go", () => {
  it("into a form, and into an infolist beside it", () => {
    // A layout, not a field and not an entry: it holds no value and is bound to
    // no column, so neither audit has anything to say about it.
    const schema = Schema.make([Callout.make("Careful").description("Mind out.")]);

    expect(auditSchema(schema)).toEqual([]);
    expect(auditInfolist(schema)).toEqual([]);
  });
});

describe("a group of fields that belong together", () => {
  it("carries its name and what it holds", async () => {
    const payload = await drawn(
      Schema.make([
        Fieldset.make("When they are here")
          .columns(2)
          .schema([TextInput.make("from"), TextInput.make("until")]),
      ]),
    );
    const group = payload.schema.children?.[0];

    expect(group?.type).toBe("Fieldset");
    expect(group?.label).toBe("When they are here");
    expect(group?.props?.["columns"]).toBe(2);
    expect(group?.children?.map((one) => one.path)).toEqual(["from", "until"]);
  });

  it("takes a line of prose and a mark like any other layout", async () => {
    const payload = await drawn(
      Schema.make([Fieldset.make("Dates").description("Both inclusive.").icon("*")]),
    );

    expect(payload.schema.children?.[0]?.description).toBe("Both inclusive.");
    expect(payload.schema.children?.[0]?.props?.["icon"]).toBe("*");
  });

  it("does not fold, which is what separates it from a section", async () => {
    // No card and no place for a page to be divided at: the grouping is what
    // is being said, and two fields are not a part of a page.
    const payload = await drawn(Schema.make([Fieldset.make("Dates")]));

    expect(payload.schema.children?.[0]?.props?.["collapsible"]).toBeUndefined();
  });
});
