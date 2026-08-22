/**
 * An option the server declared `disabled`, at the boundary.
 *
 * The flag greys a control out, and a restriction only drawn is not a
 * restriction: the same reading a disabled field gets at stage 5, one level
 * down. Every closed set is asked here rather than each in its own file,
 * because the rule is one rule and the fields that forget it forget it one at
 * a time.
 */
import { describe, expect, it } from "vitest";
import { CheckboxList } from "./fields/checkbox-list.js";
import { Radio } from "./fields/radio.js";
import { Select } from "./fields/select.js";
import { ToggleButtons } from "./fields/toggle-buttons.js";
import type { Field } from "./field.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";

const OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "guest", label: "Guest", disabled: true },
];

const answer = async (made: Field, value: unknown) => {
  const tree = await resolveSchema(Schema.make([made]), {}, { operation: "create" });
  return sanitize(tree, { role: value }).rejected[0]?.reason;
};

/** The one it is held in, so a list field is asked the same question. */
const held = (made: Field, value: string): unknown =>
  made instanceof CheckboxList ? [value] : value;

describe.each([
  ["a radio group", () => Radio.make("role").options(OPTIONS)],
  ["a set of toggle buttons", () => ToggleButtons.make("role").options(OPTIONS)],
  ["a checkbox list", () => CheckboxList.make("role").options(OPTIONS)],
  ["a select", () => Select.make("role").options(OPTIONS)],
])("%s", (_name, make) => {
  it("takes a choice the reader could have made", async () => {
    expect(await answer(make(), held(make(), "lead"))).toBeUndefined();
  });

  it("refuses one the server said it would not take", async () => {
    // Drawn out of reach and accepted anyway is a hidden button: a protection
    // that is only a drawing.
    expect(await answer(make(), held(make(), "guest"))).toBe("undeclared-value");
  });
});
