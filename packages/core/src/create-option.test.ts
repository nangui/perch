/**
 * A select that offers to make the option it is missing.
 *
 * The offer is a fact about the field; the form behind it is not. What crosses
 * to the browser is the fact alone, because a form serialised into every page
 * that might open one is a form resolved for a reader who never asked and at a
 * moment that has passed — and because a schema is not JSON.
 *
 * The two refusals here are the ones the declaration alone can be wrong about.
 * The rest — whether there is a table, whether anything decides who may write
 * to it — needs the IR and lives with the registry.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { serialise } from "./serialise.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";

const dialog = (): Schema => Schema.make([TextInput.make("name").required()]);

const nodeFor = async (select: Select) =>
  serialise(await resolveSchema(Schema.make([select]), {}, { operation: "create" }))
    .schema.children?.[0];

describe("what the browser is told", () => {
  it("is that it may create one, and not how", async () => {
    const node = await nodeFor(
      Select.make("teamId").relationship("team", "name").createOptionForm(dialog()),
    );

    expect(node?.props?.["createsOption"]).toBe(true);
    // The schema stays here. It is fetched when the dialog opens, resolved
    // against the reader who asked for it.
    expect(node?.props?.["createOptionForm"]).toBeUndefined();
  });

  it("is nothing at all where no offer was made", async () => {
    const node = await nodeFor(Select.make("teamId").relationship("team", "name"));
    expect(node?.props?.["createsOption"]).toBeUndefined();
  });
});

describe("what the boot refuses", () => {
  it("an offer on a select with no relationship", () => {
    // A declared list is a list this code wrote. There is no table behind it,
    // so the new option would last until the page was reloaded.
    const complaints = auditSchema(
      Schema.make([
        Select.make("teamId")
          .options([{ value: "1", label: "One" }])
          .createOptionForm(dialog()),
      ]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("names no relationship")]);
  });

  it("a dialog with nothing in it to fill", () => {
    const complaints = auditSchema(
      Schema.make([
        Select.make("teamId")
          .relationship("team", "name")
          .createOptionForm(Schema.make([])),
      ]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([
      expect.stringContaining("no fields to create an option with"),
    ]);
  });

  it("says nothing about one that can work", () => {
    expect(
      auditSchema(
        Schema.make([
          Select.make("teamId").relationship("team", "name").createOptionForm(dialog()),
        ]),
      ),
    ).toEqual([]);
  });
});

describe("the fields inside the dialog", () => {
  it("are held to the same rules as any others", () => {
    // Audited as its own root, because it writes another table: a name meaning
    // one column out here means a different one in there, and judging the two
    // path spaces as one would refuse a pair of forms that are both right.
    // The registry runs this; what is checked here is that there is something
    // to run it on.
    const inside = Schema.make([Select.make("mood")]);
    const select = Select.make("teamId")
      .relationship("team", "name")
      .createOptionForm(inside);

    expect(select.state.createOptionForm).toBe(inside);
    expect(auditSchema(inside).map((one) => one.problem)).toEqual([
      expect.stringContaining("neither options nor a relationship"),
    ]);
  });
});

describe("the builder", () => {
  it("does not change the select it was called on", () => {
    const before = Select.make("teamId").relationship("team", "name");
    const after = before.createOptionForm(dialog());

    expect(before.state.createOptionForm).toBeUndefined();
    expect(after.state.createOptionForm).toBeDefined();
  });
});
