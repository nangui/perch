/**
 * `Checkbox` — a real one.
 *
 * Not a styled `div` with a tick in it: a native `input[type=checkbox]`, kept
 * in the accessibility tree and driven by the platform. Space toggles it, a
 * form label clicks it, and a screen reader reads it as a checkbox because it
 * is one. The box the reader sees is drawn over it and marked `aria-hidden`.
 *
 * The label is the shell's, beside the box or above it as `.inline()` says.
 * Never a second one here: two labels for one control are read as one long
 * name.
 *
 * Disabled keeps its state visible rather than clearing it, the way every
 * other control here does: a reader has to be able to see what they cannot
 * change in order to ask why.
 */
import type { ReactNode } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
}

export function Checkbox({
  checked,
  onCheckedChange,
  status,
  binding,
}: CheckboxProps): ReactNode {
  const locked = isLocked(status);

  return (
    <div className="perch-checkbox" {...statusAttributes(status)}>
      <input
        type="checkbox"
        className="perch-checkbox__input"
        id={binding.id}
        checked={checked}
        disabled={locked}
        aria-describedby={binding["aria-describedby"]}
        aria-invalid={binding["aria-invalid"]}
        aria-required={binding["aria-required"]}
        onChange={(event) => {
          onCheckedChange(event.target.checked);
        }}
      />
      <span className="perch-checkbox__box" aria-hidden="true">
        {checked ? "✓" : ""}
      </span>
      <StatusMark status={status} />
    </div>
  );
}
