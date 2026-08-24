/**
 * `Textarea` — long text, with the character count in a footer inside the frame.
 *
 * The count lives in the footer rather than on the reserved help line, because
 * the help line belongs to the error. Both can therefore be true at once:
 * "532 / 500" in the footer and "32 characters over the limit. Not saved." below,
 * which is exactly what the source design shows.
 */
import type { ChangeEvent, ReactNode } from "react";
import { useMemo } from "react";
import type { FieldStatus } from "../field-state.js";
import { statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { countGraphemes } from "../graphemes.js";

export interface TextareaProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly placeholder?: string;
  /** Shows the count. The input is not truncated: over-limit is an error state,
   *  not a silent clip — the user must see what they wrote. */
  readonly maxLength?: number;
  readonly rows?: number;
  /**
   * Grows with what is in it.
   *
   * `field-sizing: content` rather than measuring `scrollHeight` on every
   * keystroke: the browser does it during layout, so there is no reflow to
   * schedule and nothing to get wrong when the value arrives from the server
   * instead of from typing. Where it is unsupported the box keeps `rows`,
   * which is the same box as not asking for this at all.
   */
  readonly autosize?: boolean;
}

export function Textarea({
  value,
  onChange,
  status,
  binding,
  placeholder,
  maxLength,
  rows,
  autosize = false,
}: TextareaProps): ReactNode {
  const length = useMemo(() => countGraphemes(value), [value]);
  const over = maxLength !== undefined && length > maxLength;
  const readOnly = status.readOnly === true;

  return (
    <div className="perch-textarea" {...statusAttributes(status)}>
      <textarea
        {...binding}
        className="perch-textarea__input"
        {...(autosize ? { "data-autosize": "true" } : {})}
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(event.target.value);
        }}
      />

      {maxLength === undefined && !readOnly && status.lifecycle === "rest" ? null : (
        <div className="perch-textarea__footer">
          {readOnly ? (
            <span className="perch-textarea__status perch-textarea__status--muted">
              Read only
            </span>
          ) : over ? (
            <span className="perch-textarea__status perch-textarea__status--error">
              Too long
            </span>
          ) : status.lifecycle === "draft" ? (
            <span className="perch-textarea__status">Unsaved</span>
          ) : status.lifecycle === "inFlight" ? (
            <span className="perch-textarea__status perch-textarea__status--muted">
              Saving…
            </span>
          ) : null}

          {maxLength === undefined ? null : (
            <span
              className={`perch-textarea__count${over ? " perch-textarea__count--error" : ""}`}
            >
              {length} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
