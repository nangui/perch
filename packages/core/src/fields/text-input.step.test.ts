/**
 * The grain a numeric field comes in, enforced where it can be.
 *
 * `.numeric(0.5)` was sent to the browser and applied by nothing: the control
 * is deliberately not `type="number"`, and `step` means nothing on anything
 * else. The server did not check it either, so the declaration was a promise
 * with no keeper — found when the props guard was asked where a prop is read
 * rather than whether the word appears somewhere.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { TextInput } from "./text-input.js";
import { resolveSchema } from "../resolve.js";

const saving = async (value: unknown, step?: number) => {
  const field =
    step === undefined
      ? TextInput.make("size").numeric()
      : TextInput.make("size").numeric(step);
  const tree = await resolveSchema(
    Schema.make([field]),
    { size: value },
    {
      operation: "create",
    },
  );
  return tree.errors["size"];
};

describe("a value on the step", () => {
  it("is accepted", async () => {
    expect(await saving("2.5", 0.5)).toBeUndefined();
  });

  it("is accepted where floating point says otherwise", async () => {
    // `2.4 % 0.1` is 0.09999999999999978. The obvious check refuses the value
    // it was written to allow.
    expect(await saving("2.4", 0.1)).toBeUndefined();
    expect(await saving("0.3", 0.1)).toBeUndefined();
    expect(await saving("100", 0.01)).toBeUndefined();
  });

  it("is accepted as a number as readily as a string", async () => {
    expect(await saving(2.5, 0.5)).toBeUndefined();
  });

  it("is accepted below zero, which is still on the grain", async () => {
    expect(await saving("-1.5", 0.5)).toBeUndefined();
  });
});

describe("a value between two steps", () => {
  it("is refused, and told what the grain is", async () => {
    expect(await saving("2.45", 0.5)).toBe("Must be a multiple of 0.5.");
  });

  it("is refused on a whole-number grain too", async () => {
    expect(await saving("150", 100)).toBe("Must be a multiple of 100.");
  });
});

describe("what the rule stays out of", () => {
  it("says nothing where no step was declared", async () => {
    expect(await saving("2.45")).toBeUndefined();
  });

  it("says nothing about a blank, which is `required`'s to judge", async () => {
    expect(await saving("", 0.5)).toBeUndefined();
  });

  it("says nothing about text, which is a complaint nothing makes yet", async () => {
    expect(await saving("abc", 0.5)).toBeUndefined();
  });
});

describe("a step that is not one", () => {
  it("stops the boot rather than reading as a limit that refuses nothing", () => {
    expect(auditSchema(Schema.make([TextInput.make("size").numeric(0)]))).toEqual([
      { field: "size", problem: expect.stringContaining("positive number") },
    ]);
  });

  it("stops it for a negative one too", () => {
    expect(auditSchema(Schema.make([TextInput.make("size").numeric(-1)])).length).toBe(
      1,
    );
  });

  it("says nothing about a step that is one", () => {
    expect(auditSchema(Schema.make([TextInput.make("size").numeric(0.5)]))).toEqual([]);
  });
});
