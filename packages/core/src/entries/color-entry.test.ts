/**
 * What a colour entry declares.
 *
 * Little of it: the value is whatever the row held, and this half does not read
 * it. What it does decide is whether a button appears beside it, which is one
 * flag and one clone away from being shared between two requests.
 */
import { describe, expect, it } from "vitest";
import { ColorEntry } from "./color-entry.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";

const drawn = async (entry: ColorEntry, record: Record<string, unknown>) =>
  serialise(
    await resolveSchema(Schema.make([entry]), {}, { operation: "edit", record }),
  ).schema.children?.[0];

describe("a colour entry", () => {
  it("offers no button until one is asked for", () => {
    expect(ColorEntry.make("tint").state.copyable).toBeUndefined();
  });

  it("is cloned rather than changed, like every other builder", () => {
    const plain = ColorEntry.make("tint");
    const copied = plain.copyable();

    expect(copied).not.toBe(plain);
    expect(plain.state.copyable).toBeUndefined();
    expect(copied.state.copyable).toBe(true);
  });

  it("carries the flag across the wire, and nothing else it was not asked for", async () => {
    const node = await drawn(ColorEntry.make("tint").label("Tint").copyable(), {
      tint: "#0f0",
    });

    expect(node?.type).toBe("ColorEntry");
    expect(node?.props?.["copyable"]).toBe(true);
    expect(node?.value).toBe("#0f0");
  });

  it("sends no flag where none was declared", async () => {
    const node = await drawn(ColorEntry.make("tint").label("Tint"), { tint: "#0f0" });

    expect(node?.props?.["copyable"]).toBeUndefined();
  });
});
