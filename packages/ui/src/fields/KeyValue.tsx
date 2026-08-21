/**
 * `KeyValue` — the pairs in a `Json` column, as rows of two boxes.
 *
 * The rows are keyed by position rather than by the key they hold, which is
 * the opposite of what a list usually wants and is right here: the key is the
 * thing being typed into, so keying by it would remount the row on every
 * keystroke and take the cursor with it.
 *
 * Every row is sent, including one nobody has typed into yet. Dropping the
 * blank ones here would take a row off the page as the reader empties it, with
 * the focus going to whichever row moved up into its place. What a key has to
 * look like is settled where the object is built, not on the way out of this.
 */
import type { ReactNode } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export type Pair = readonly [key: string, value: string];

export interface KeyValueProps {
  /** The rows, in the order they are shown. Never `null`: none is an empty list. */
  readonly value: readonly Pair[];
  readonly onValueChange: (value: readonly Pair[]) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Names the group, so the table is announced as this field. */
  readonly label: string;
  readonly keyLabel?: string;
  readonly valueLabel?: string;
}

export function KeyValue({
  value,
  onValueChange,
  status,
  binding,
  label,
  keyLabel = "Key",
  valueLabel = "Value",
}: KeyValueProps): ReactNode {
  const locked = isLocked(status);

  function edit(at: number, part: 0 | 1, text: string): void {
    onValueChange(
      value.map((row, index) =>
        index !== at ? row : ((part === 0 ? [text, row[1]] : [row[0], text]) as Pair),
      ),
    );
  }

  /**
   * A box in the frame every other control on the page is drawn in.
   *
   * The frame is the wrapper: the border, the height and the disabled, invalid
   * and draft states are drawn from the attributes it carries, and a bare input
   * wearing that class would only ever look right at rest.
   */
  function box(
    name: string,
    held: string,
    on: (text: string) => void,
    id?: string,
  ): ReactNode {
    return (
      <div className="perch-control" {...statusAttributes(status)}>
        <input
          type="text"
          className="perch-control__input"
          aria-label={name}
          {...(id === undefined ? {} : { id })}
          value={held}
          disabled={locked}
          onChange={(event) => {
            on(event.target.value);
          }}
        />
      </div>
    );
  }

  return (
    <fieldset
      className="perch-kv"
      aria-describedby={binding["aria-describedby"]}
      {...statusAttributes(status)}
    >
      {/* Named for the field, so the table is announced as that field rather
          than as a run of boxes. */}
      <legend className="perch-visually-hidden">{label}</legend>

      {value.length === 0 ? null : (
        <div className="perch-kv__rows">
          {/* Named on every box as well, so a reader who is not looking at the
              columns is still told which of the two they are in. */}
          <div className="perch-kv__head" aria-hidden="true">
            <span>{keyLabel}</span>
            <span>{valueLabel}</span>
            <span />
          </div>

          {value.map(([key, held], at) => (
            // By position, not by key: the key is what is being typed into.
            <div className="perch-kv__row" key={at}>
              {box(
                `${keyLabel} ${String(at + 1)}`,
                key,
                (text) => {
                  edit(at, 0, text);
                },
                // The shell's label points at the first box there is.
                at === 0 ? binding.id : undefined,
              )}
              {box(`${valueLabel} ${String(at + 1)}`, held, (text) => {
                edit(at, 1, text);
              })}
              <button
                type="button"
                className="perch-kv__remove"
                aria-label={`Remove ${key === "" ? `row ${String(at + 1)}` : key}`}
                disabled={locked}
                onClick={() => {
                  onValueChange(value.filter((_, index) => index !== at));
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="perch-button perch-kv__add"
        // The first box of the first row carries the shell's id, and there are
        // no rows to carry it when the table is empty — so this does. Named
        // here rather than by its text, because a `<label for>` pointing at a
        // button renames it, and then the one control on screen is announced
        // as the field.
        aria-label="Add"
        {...(value.length === 0 ? { id: binding.id } : {})}
        disabled={locked}
        onClick={() => {
          onValueChange([...value, ["", ""]]);
        }}
      >
        Add
      </button>
      <StatusMark status={status} />
    </fieldset>
  );
}
