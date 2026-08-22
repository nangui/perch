/**
 * `ToggleButtons` — a radio group wearing buttons.
 *
 * The same set of native radios underneath, because the difference is how much
 * room the choices ask for and how hard they are to hit, not what they mean. A
 * reimplementation with `role="radio"` and a `tabIndex` dance would trade the
 * browser's own keyboard handling for clothes.
 *
 * `grouped` joins the buttons into one block. Sharing an edge means standing in
 * a row, so it draws them in one whatever `inline` says.
 */
import type { ReactNode } from "react";
import type { ChoiceGroupProps, ChoiceOption } from "./ChoiceGroup.js";
import { ChoiceGroup } from "./ChoiceGroup.js";

export type ToggleOption = ChoiceOption;

export type ToggleButtonsProps = Omit<ChoiceGroupProps, "look">;

export function ToggleButtons(props: ToggleButtonsProps): ReactNode {
  return <ChoiceGroup {...props} look="button" />;
}
