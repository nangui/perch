/**
 * `Radio` — every choice on the page at once.
 *
 * Native `input[type=radio]` sharing a `name`, which is what makes the group a
 * group: the browser gives arrow-key navigation between the options, one tab
 * stop for all of them, and the roving focus that goes with it. Written by
 * hand, that is a `role="radiogroup"` and a `tabIndex` dance to reimplement
 * badly.
 *
 * The inputs are taken out of sight rather than out of the layout — `display:
 * none` would take them out of the tab order too — and the dot the reader sees
 * is drawn beside each one and marked `aria-hidden`.
 *
 * `inline` lays the choices in a row. It is about the choices; where the label
 * sits is `.inlineLabel()`, which every field has.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface RadioProps {
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly RadioOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** The choices in a row rather than stacked. */
  readonly inline?: boolean;
  /** Names the group. The field's own label. */
  readonly label: string;
}

export function Radio({
  value,
  onValueChange,
  options,
  status,
  binding,
  inline = false,
  label,
}: RadioProps): ReactNode {
  const group = useId();
  const locked = isLocked(status);

  if (options.length === 0) {
    // The same shape as a control, so the row keeps its height and nothing
    // below it moves. A field that vanishes is one nobody can ask about.
    return (
      <div className="perch-radio perch-radio--empty" {...statusAttributes(status)}>
        {/* The shell's label points here by id. There is no control to focus —
            there is nothing to choose — but a `for` naming an element that does
            not exist is a label attached to nobody. */}
        <span id={binding.id} className="perch-radio__empty">
          No options available
        </span>
      </div>
    );
  }

  return (
    <div
      // `radiogroup` on the wrapper names the set for a screen reader; the
      // inputs inside keep their own native semantics.
      role="radiogroup"
      aria-label={label}
      aria-describedby={binding["aria-describedby"]}
      aria-required={binding["aria-required"]}
      className="perch-radio"
      data-inline={inline ? "true" : undefined}
      {...statusAttributes(status)}
    >
      {options.map((option, index) => {
        const id = `${group}-${String(index)}`;
        const unavailable = locked || option.disabled === true;

        return (
          <div className="perch-radio__option" key={option.value}>
            <input
              type="radio"
              className="perch-radio__input"
              // The shared name is what makes these one group to the browser.
              name={group}
              id={index === 0 ? binding.id : id}
              value={option.value}
              checked={option.value === value}
              disabled={unavailable}
              onChange={() => {
                onValueChange(option.value);
              }}
            />
            <span className="perch-radio__dot" aria-hidden="true" />
            <label
              className="perch-radio__label"
              htmlFor={index === 0 ? binding.id : id}
            >
              {option.label}
            </label>
          </div>
        );
      })}
      <StatusMark status={status} />
    </div>
  );
}
