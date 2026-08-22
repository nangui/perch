/**
 * `Radio` — every choice on the page at once.
 *
 * A select hides its choices behind a click and scales to fifty thousand; a
 * radio group shows every one at once and stops being usable past a handful.
 *
 * `inline` lays the choices in a row. It is about the choices; where the label
 * sits is `.inlineLabel()`, which every field has.
 */
import type { ReactNode } from "react";
import type { ChoiceGroupProps, ChoiceOption } from "./ChoiceGroup.js";
import { ChoiceGroup } from "./ChoiceGroup.js";

export type RadioOption = ChoiceOption;

export type RadioProps = Omit<ChoiceGroupProps, "look" | "grouped">;

export function Radio(props: RadioProps): ReactNode {
  return <ChoiceGroup {...props} look="dot" />;
}
