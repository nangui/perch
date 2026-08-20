/**
 * The same layout in both trees.
 *
 * The layouts behave identically in a form and in an infolist — one
 * implementation, which is what a layout being a `Component` rather than a
 * field buys, and which is only true while something tests both.
 */
import { describe, expect, it } from "vitest";
import { Schema, Tab, Tabs } from "./layout.js";
import { TextEntry } from "./entries/text-entry.js";
import { TextInput } from "./fields/text-input.js";
import { auditSchema } from "./audit.js";
import { resolveSchema } from "./resolve.js";
import { serialise } from "./serialise.js";

const shape = (panels: readonly Tab[]) => Schema.make([Tabs.make().tabs(panels)]);

describe("a set of tabs", () => {
  it("carries its panels, each named by what its tab reads", async () => {
    const tree = await resolveSchema(
      shape([Tab.make("About").schema([TextInput.make("bio")])]),
      {},
      { operation: "edit" },
    );

    const tabs = serialise(tree).schema.children?.[0];
    expect(tabs?.type).toBe("Tabs");
    expect(tabs?.children?.[0]).toMatchObject({ type: "Tab", label: "About" });
  });

  it("resolves what is inside a panel like anything else in the tree", async () => {
    const tree = await resolveSchema(
      shape([Tab.make("About").schema([TextInput.make("bio").label("Bio")])]),
      { bio: "Something" },
      { operation: "edit" },
    );

    const field = serialise(tree).schema.children?.[0]?.children?.[0]?.children?.[0];
    expect(field).toMatchObject({ type: "TextInput", path: "bio", label: "Bio" });
  });

  it("leaves out a panel nobody may see, like any other layout", async () => {
    // Not hidden on the client: a node the client never receives cannot leak
    // what is in it.
    const tree = await resolveSchema(
      shape([
        Tab.make("About").schema([TextInput.make("bio")]),
        Tab.make("Secret")
          .hidden()
          .schema([TextInput.make("token")]),
      ]),
      {},
      { operation: "edit" },
    );

    expect(serialise(tree).schema.children?.[0]?.children?.length).toBe(1);
  });
});

describe("the same tabs around a field and around an entry", () => {
  it("come out as the same layout, differing only in what they hold", async () => {
    const panels = (inner: TextInput | TextEntry) =>
      shape([Tab.make("About").schema([inner])]);

    const form = serialise(
      await resolveSchema(panels(TextInput.make("bio")), {}, { operation: "edit" }),
    ).schema.children?.[0];
    const infolist = serialise(
      await resolveSchema(
        panels(TextEntry.make("bio")),
        {},
        {
          operation: "view",
          record: { bio: "Something" },
        },
      ),
    ).schema.children?.[0];

    expect(form?.type).toBe(infolist?.type);
    expect(form?.children?.[0]?.label).toBe(infolist?.children?.[0]?.label);
    expect(form?.children?.[0]?.props).toEqual(infolist?.children?.[0]?.props);
  });
});

describe("a set of panels that cannot be drawn", () => {
  it("stops the boot when it holds no panels", () => {
    expect(auditSchema(Schema.make([Tabs.make()]))).toEqual([
      {
        field: expect.stringContaining("Tabs"),
        problem: expect.stringContaining("no panels"),
      },
    ]);
  });

  it("stops it when something that is not a panel is put in one", () => {
    // Measured before this: no complaint, and the field was serialised as a
    // panel — drawn as a tab named after itself, opening on an empty box.
    const complaints = auditSchema(
      Schema.make([Tabs.make().schema([TextInput.make("bio")])]),
    );

    expect(complaints).toEqual([
      { field: "bio", problem: expect.stringContaining("directly inside a `Tabs`") },
    ]);
  });

  it("says nothing about a set that holds panels", () => {
    expect(
      auditSchema(shape([Tab.make("About").schema([TextInput.make("bio")])])),
    ).toEqual([]);
  });
});
