/**
 * One of a few, drawn either way.
 *
 * Native `input[type=radio]` sharing a `name`, which is what makes the group a
 * group: the browser gives arrow-key navigation between the options, one tab
 * stop for all of them, and the roving focus that goes with it. Written by
 * hand, that is a `role="radiogroup"` and a `tabIndex` dance to reimplement
 * badly.
 *
 * The inputs are taken out of sight rather than out of the layout — `display:
 * none` would take them out of the tab order too — and what the reader sees is
 * drawn beside each one and marked `aria-hidden`.
 *
 * A radio group and a set of toggle buttons differ in how they are dressed and
 * in nothing else, so they are one component wearing two sets of clothes. The
 * class names are spelt out here rather than built from a prefix, so a name
 * found in the stylesheet is found in the source too.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Which clothes: a dot beside each choice, or the choice as a button. */
export type ChoiceLook = "dot" | "button";

const LOOKS = {
  dot: {
    group: "perch-radio",
    empty: "perch-radio--empty",
    nothing: "perch-radio__empty",
    option: "perch-radio__option",
    input: "perch-radio__input",
    mark: "perch-radio__dot",
    label: "perch-radio__label",
  },
  button: {
    group: "perch-toggles",
    empty: "perch-toggles--empty",
    nothing: "perch-toggles__empty",
    option: "perch-toggles__option",
    input: "perch-toggles__input",
    // Nothing beside the choice: the button the reader presses is the label.
    mark: undefined,
    label: "perch-toggles__label",
  },
} as const;

export interface ChoiceGroupProps {
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly ChoiceOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly look: ChoiceLook;
  /** The choices in a row rather than stacked. */
  readonly inline?: boolean;
  /** The choices joined into one block. Standing in a row is part of it. */
  readonly grouped?: boolean;
  /** Names the group. The field's own label. */
  readonly label: string;
}

export function ChoiceGroup({
  value,
  onValueChange,
  options,
  status,
  binding,
  look,
  inline = false,
  grouped = false,
  label,
}: ChoiceGroupProps): ReactNode {
  const group = useId();
  const locked = isLocked(status);
  const style = LOOKS[look];

  if (options.length === 0) {
    // The same shape as a control, so the row keeps its height and nothing
    // below it moves. A field that vanishes is one nobody can ask about.
    return (
      <div className={`${style.group} ${style.empty}`} {...statusAttributes(status)}>
        {/* The shell's label points here by id. There is no control to focus —
            there is nothing to choose — but a `for` naming an element that does
            not exist is a label attached to nobody. */}
        <span id={binding.id} className={style.nothing}>
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
      className={style.group}
      data-inline={inline ? "true" : undefined}
      data-grouped={grouped ? "true" : undefined}
      {...statusAttributes(status)}
    >
      {options.map((option, index) => {
        const id = `${group}-${String(index)}`;
        const unavailable = locked || option.disabled === true;

        return (
          <div className={style.option} key={option.value}>
            <input
              type="radio"
              className={style.input}
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
            {style.mark === undefined ? null : (
              <span className={style.mark} aria-hidden="true" />
            )}
            <label className={style.label} htmlFor={index === 0 ? binding.id : id}>
              {option.label}
            </label>
          </div>
        );
      })}
      <StatusMark status={status} />
    </div>
  );
}
