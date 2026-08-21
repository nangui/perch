/**
 * `CheckboxList` — every choice on the page, any number of them taken.
 *
 * Native `input[type=checkbox]` inside a `<fieldset>`, which is what makes the
 * set a set: a group with a name, announced on the way in, with each box its
 * own tab stop. That is what a checkbox group is, and reimplementing it as
 * `role="group"` over divs buys nothing.
 *
 * Unlike a radio group there is no roving focus to inherit — several boxes can
 * be ticked, so each is reached in turn — which is why this is a fieldset and
 * the radio is a wrapper with `role="radiogroup"`.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface CheckboxListOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface CheckboxListProps {
  /** What is ticked. Never `null`: nothing ticked is an empty list. */
  readonly value: readonly string[];
  readonly onValueChange: (value: readonly string[]) => void;
  readonly options: readonly CheckboxListOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Names the group. The field's own label. */
  readonly label: string;
  readonly columns?: number;
  readonly bulkToggleable?: boolean;
}

export function CheckboxList({
  value,
  onValueChange,
  options,
  status,
  binding,
  label,
  columns,
  bulkToggleable = false,
}: CheckboxListProps): ReactNode {
  const group = useId();
  const locked = isLocked(status);

  if (options.length === 0) {
    // The same shape as a control, so the row keeps its height and nothing
    // below it moves. A field that vanishes is one nobody can ask about.
    return (
      <div
        className="perch-checkbox-list perch-checkbox-list--empty"
        {...statusAttributes(status)}
      >
        {/* The shell's label points here by id. There is no control to focus —
            there is nothing to choose — but a `for` naming an element that does
            not exist is a label attached to nobody, which is worse than one
            attached to the words that replaced the control. */}
        <span id={binding.id} className="perch-checkbox-list__empty">
          No options available
        </span>
      </div>
    );
  }

  const ticked = new Set(value);
  // What a reader may still act on, which is what "all of them" has to mean:
  // a bulk control that ticked a disabled box would write what the box refuses.
  const reachable = options.filter((one) => one.disabled !== true);
  const all = reachable.length > 0 && reachable.every((one) => ticked.has(one.value));

  return (
    <fieldset
      className="perch-checkbox-list"
      aria-describedby={binding["aria-describedby"]}
      // A custom property carries the count, so the stylesheet owns the grid
      // and this owns the number. Typed as a plain record for the same reason
      // the layouts do it: `CSSProperties` has no room for a `--` key.
      style={
        columns === undefined
          ? undefined
          : ({ "--perch-choices": String(columns) } as Record<string, string>)
      }
      {...statusAttributes(status)}
    >
      {/* Named for the field, so the group is announced as that field rather
          than as an unnamed set of boxes. */}
      <legend className="perch-visually-hidden">{label}</legend>

      {bulkToggleable ? (
        <label className="perch-checkbox-list__all">
          <input
            type="checkbox"
            checked={all}
            disabled={locked || reachable.length === 0}
            onChange={() => {
              // What is kept is what the reader could not have changed: a
              // disabled box that was ticked stays ticked either way.
              const kept = value.filter(
                (one) => !reachable.some((option) => option.value === one),
              );
              onValueChange(all ? kept : [...kept, ...reachable.map((o) => o.value)]);
            }}
          />
          <span>{all ? "Untick all" : "Tick all"}</span>
        </label>
      ) : null}

      <div className="perch-checkbox-list__options">
        {options.map((option, index) => {
          const id = `${group}-${String(index)}`;
          const unavailable = locked || option.disabled === true;

          return (
            <div className="perch-checkbox-list__option" key={option.value}>
              <input
                type="checkbox"
                className="perch-checkbox-list__input"
                id={index === 0 ? binding.id : id}
                value={option.value}
                checked={ticked.has(option.value)}
                disabled={unavailable}
                onChange={(event) => {
                  // Rebuilt from the declared order rather than by appending,
                  // so what is written does not depend on the order a reader
                  // happened to tick things in.
                  const next = new Set(ticked);
                  if (event.target.checked) next.add(option.value);
                  else next.delete(option.value);
                  onValueChange(
                    options.map((o) => o.value).filter((one) => next.has(one)),
                  );
                }}
              />
              <label
                className="perch-checkbox-list__label"
                htmlFor={index === 0 ? binding.id : id}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
      <StatusMark status={status} />
    </fieldset>
  );
}
