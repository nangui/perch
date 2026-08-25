/**
 * The wrapper that makes the design's central promise true.
 *
 * From the source design's own header, translated: *"Every field occupies the
 * same height at rest, while loading and in error: the error message and the
 * help text share one reserved line under the control, so a patch from the
 * server never makes the layout jump."*
 *
 * So the help line is always rendered, always at least
 * `--perch-help-line-height` tall, and carries either the help text or the error.
 * Not a conditional element — a reserved one. This is the visual half of "the
 * state is authoritative on the server": the server may add an error on any
 * round trip, and nothing below the field may move when it does.
 *
 * It also owns the accessibility wiring: the label is bound to the control, and
 * the help line is referenced by `aria-describedby` so a screen reader reads
 * the error with the field rather than in isolation.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import type { FieldStatus } from "./field-state.js";

export interface FieldShellProps {
  readonly label: string;
  /** A short annotation beside the label: `canonical`, `400 ms`, `server`. */
  readonly tag?: string;
  readonly help?: string;
  /**
   * A word the field declared, beside the label rather than under the control.
   *
   * The line under a control belongs to the error, so a hint that lived there
   * would be replaced by one — the reader loses the instruction exactly when
   * they have got something wrong.
   */
  readonly hint?: string;
  /** A glyph before it. Decoration: the hint carries the meaning. */
  readonly hintIcon?: string;
  /**
   * Attributes the declaration asked for, already narrowed to ones that
   * describe: the boot refuses anything a browser reads as an instruction.
   * Spread first on the control, never over the bindings — a declaration does
   * not get to rename the element the label points at.
   */
  readonly extraAttributes?: Readonly<Record<string, string>>;
  readonly autofocus?: boolean;
  readonly status: FieldStatus;
  readonly required?: boolean;
  /**
   * The label beside the control rather than above it.
   *
   * For the fields where the label reads as part of the control — a checkbox
   * and the thing it agrees to — and never a way out of the reserved help
   * line: the row moves, the line under it does not.
   */
  readonly inline?: boolean;
  /**
   * Receives the ids to bind. The control must spread `controlProps` onto its
   * focusable element, or the label and the error are announced to nobody.
   */
  readonly children: (controlProps: ControlBinding) => ReactNode;
}

export interface ControlBinding {
  /**
   * Whatever the declaration asked for, beside what the shell owes the control.
   *
   * Open on purpose, and narrow in practice: the boot refuses any attribute a
   * browser reads as an instruction, and the shell writes its own bindings
   * after these, so an `id` from a resource cannot take the one the label
   * points at.
   */
  readonly [attribute: string]: unknown;
  readonly id: string;
  readonly "aria-describedby": string;
  readonly "aria-invalid": boolean;
  readonly "aria-required": boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
}

export function FieldShell({
  label,
  tag,
  help,
  hint,
  hintIcon,
  extraAttributes,
  autofocus,
  status,
  required = false,
  inline = false,
  children,
}: FieldShellProps): ReactNode {
  const controlId = useId();
  const helpId = `${controlId}-help`;
  const invalid = status.error !== undefined;

  return (
    <div className="perch-field" {...(inline ? { "data-inline": "true" } : {})}>
      <div className="perch-field__label">
        <label className="perch-field__label-text" htmlFor={controlId}>
          {label}
          {required ? (
            <>
              {" "}
              <span className="perch-field__required" aria-hidden="true">
                *
              </span>
            </>
          ) : null}
        </label>
        {tag === undefined ? null : <span className="perch-field__tag">{tag}</span>}
        {/* At the other end of the row, because the line under the control
            belongs to the error — a hint living there is replaced by one
            exactly when the reader needs both. */}
        {hint === undefined ? null : (
          <span className="perch-field__hint">
            {hintIcon === undefined ? null : (
              <span className="perch-field__hint-icon" aria-hidden="true">
                {hintIcon}
              </span>
            )}
            {hint}
          </span>
        )}
      </div>

      {children({
        // The declaration's own first, so nothing below can be overwritten by
        // it: an `id` or an `aria-describedby` out of a resource would break
        // the label and the help line that point at this control.
        ...extraAttributes,
        ...(autofocus === true ? { autoFocus: true } : {}),
        id: controlId,
        // Always pointed at, even when empty: an id that appears only on error
        // is an id assistive tech has to re-read.
        "aria-describedby": helpId,
        "aria-invalid": invalid,
        "aria-required": required,
        disabled: status.disabled === true,
        readOnly: status.readOnly === true,
      })}

      {/*
        The reserved line. `role="status"` with a polite live region so an error
        arriving on a round trip is announced without stealing focus.
        Rendered even when empty — that is the whole point.
      */}
      <div
        className="perch-field__help"
        id={helpId}
        data-error={invalid ? "true" : "false"}
        role="status"
        aria-live="polite"
      >
        {status.error ?? help ?? ""}
      </div>
    </div>
  );
}
