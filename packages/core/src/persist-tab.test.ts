/**
 * A tab set that asks to be remembered says so on the wire.
 *
 * Which panel is open is the browser's to keep — it is in the address, and the
 * server has no opinion about it. What the server does decide is whether this
 * set asked for that at all, and a flag that never crosses is a builder method
 * that reads as configuration and does nothing.
 */
import { describe, expect, it } from "vitest";
import { Schema, Tab, Tabs } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { serialise } from "./serialise.js";
import { TextInput } from "./fields/text-input.js";

const nodeFor = async (tabs: Tabs) =>
  serialise(await resolveSchema(Schema.make([tabs]), {}, { operation: "create" }))
    .schema.children?.[0];

const panels = (): readonly Tab[] => [
  Tab.make("Identity").schema([TextInput.make("firstName")]),
  Tab.make("Address").schema([TextInput.make("city")]),
];

describe("what the browser is told", () => {
  it("is that the open panel belongs in the address", async () => {
    const node = await nodeFor(Tabs.make().tabs(panels()).persistTab());
    expect(node?.props?.["persistTab"]).toBe(true);
  });

  it("is nothing where the set did not ask", async () => {
    const node = await nodeFor(Tabs.make().tabs(panels()));
    expect(node?.props?.["persistTab"]).toBeUndefined();
  });

  it("can be turned back off", async () => {
    const node = await nodeFor(Tabs.make().tabs(panels()).persistTab(false));
    expect(node?.props?.["persistTab"]).toBe(false);
  });
});

describe("the builder", () => {
  it("does not change the set it was called on", async () => {
    const before = Tabs.make().tabs(panels());
    const after = before.persistTab();

    expect((await nodeFor(before))?.props?.["persistTab"]).toBeUndefined();
    expect((await nodeFor(after))?.props?.["persistTab"]).toBe(true);
  });
});
