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
 * It also owns the accessibility wiring ARCH 13 §10 requires: the label is bound
 * to the control, and the help line is referenced by `aria-describedby` so a
 * screen reader reads the error with the field rather than in isolation.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import type { FieldStatus } from "./field-state.js";

export interface FieldShellProps {
  readonly label: string;
  /** A short annotation beside the label: `canonical`, `400 ms`, `server`. */
  readonly tag?: string;
  readonly help?: string;
  readonly status: FieldStatus;
  readonly required?: boolean;
  /**
   * Receives the ids to bind. The control must spread `controlProps` onto its
   * focusable element, or the label and the error are announced to nobody.
   */
  readonly children: (controlProps: ControlBinding) => ReactNode;
}

export interface ControlBinding {
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
  status,
  required = false,
  children,
}: FieldShellProps): ReactNode {
  const controlId = useId();
  const helpId = `${controlId}-help`;
  const invalid = status.error !== undefined;

  return (
    <div className="perch-field">
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
      </div>

      {children({
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
        arriving on a round trip is announced without stealing focus (ARCH 13
        §10). Rendered even when empty — that is the whole point.
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
