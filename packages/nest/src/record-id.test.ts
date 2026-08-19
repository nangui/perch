/**
 * A URL segment is a string and a JSON body is not, so the panel decides the
 * type here rather than leaving each adapter to guess. `null` is what it says
 * when no row can carry that key.
 */
import type { DataAdapter, ScalarType } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import { recordId } from "./record-id.js";
import { key, model } from "./__fixtures__/ir.js";

function adapterWithKey(type: ScalarType): DataAdapter {
  // The key's type is the whole subject here; everything else is ordinary.
  const meta = model({ primaryKey: key({ type }), labelField: "id" });
  return { meta: () => meta } as unknown as DataAdapter;
}

const forType = (type: ScalarType, raw: string | number) =>
  recordId(adapterWithKey(type), "Post", raw);

describe("an integer key", () => {
  it("takes the same value from either entry point", () => {
    expect(forType("Int", "7")).toBe(7);
    expect(forType("Int", 7)).toBe(7);
  });

  it.each([
    ["a word", "abc"],
    ["something empty", ""],
    ["whitespace, which Number reads as zero", "  "],
    ["a fraction", "1.5"],
    ["an overflow", "1e400"],
  ])("refuses %s", (_, raw) => {
    expect(forType("Int", raw)).toBeNull();
  });
});

describe("a string key", () => {
  it("is left alone, digits and all", () => {
    expect(forType("String", "abc")).toBe("abc");
    expect(forType("String", "007")).toBe("007");
    expect(forType("String", 7)).toBe("7");
  });

  it("refuses an empty one", () => {
    expect(forType("String", "")).toBeNull();
  });
});

describe("a fractional key", () => {
  it("keeps the fraction an integer key would refuse", () => {
    expect(forType("Float", "1.5")).toBe(1.5);
    expect(forType("Decimal", "1.5")).toBe(1.5);
  });
});
