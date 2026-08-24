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

describe("a value far from zero", () => {
  it("is still judged against the grain, not waved through", async () => {
    // A tolerance proportional to the quotient grows past half a step: with a
    // step of one, everything above about five hundred million stopped being
    // checked at all. What absorbs floating-point error has to be sized on
    // floating-point error, not on a round number somebody liked.
    expect(await saving("1000000000.5", 1)).toBe("Must be a multiple of 1.");
    expect(await saving("1000000000", 1)).toBeUndefined();
  });

  it("is judged one decade further up, where the slack was going to swallow it", async () => {
    // Proportional slack eventually passes half a step whatever the constant.
    expect(await saving("1000000000000000.5", 1)).toBe("Must be a multiple of 1.");
    expect(await saving("1000000000000000", 1)).toBeUndefined();
  });

  it("is judged against the grain and not against a comfortable margin", async () => {
    // Off by a hundred-thousandth on a tenth grain. Slack picked as a round
    // number rather than derived from the error accepts this; slack sized on
    // the units in the last place a quotient actually carries refuses it.
    expect(await saving("100000.00001", 0.1)).toBe("Must be a multiple of 0.1.");
    expect(await saving("12345.000001", 0.01)).toBe("Must be a multiple of 0.01.");
  });

  it("is judged the same on a fine grain", async () => {
    expect(await saving("12345678.905", 0.01)).toBe("Must be a multiple of 0.01.");
    expect(await saving("12345678.9", 0.01)).toBeUndefined();
  });
});

describe("what the rule stays out of", () => {
  it("says nothing where no step was declared", async () => {
    expect(await saving("2.45")).toBeUndefined();
  });

  it("says nothing about a blank, which is `required`'s to judge", async () => {
    expect(await saving("", 0.5)).toBeUndefined();
  });

  it("leaves text to the rule that is about text", async () => {
    // The step rule says nothing about `abc` — a multiple of half of nothing
    // is not a sentence. What refuses it is the flavour, which used to be a
    // control a browser draws and nothing else.
    expect(await saving("abc", 0.5)).toBe("Must be a number.");
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
