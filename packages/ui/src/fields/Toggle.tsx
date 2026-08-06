/**
 * `Toggle` — Radix Switch, styled.
 *
 * Radix rather than a styled checkbox because ARCH 13 §10 says we do not rewrite
 * accessible primitives. It brings the role, the keyboard contract and the
 * disabled semantics; we bring the skin.
 *
 * Commits at 0 ms (ARCH 13 §5), which produces the one place optimism is allowed
 * to touch something other than the draft zone: the knob moves at once. The
 * design is explicit about the contract that makes this safe — *"it never returns
 * to its old position unless the server refuses"*. So `checked` is what the caller
 * says, the caller flips it optimistically, and a refusal flips it back with an
 * error on the reserved line.
 *
 * The only field outside `FieldShell` — the design puts the label beside the
 * switch — so it owns the label and description wiring itself.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import * as Switch from "@radix-ui/react-switch";
import type { FieldStatus } from "../field-state.js";
import { isLocked } from "../field-state.js";

export interface ToggleProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: string;
  readonly help?: string;
  readonly status: FieldStatus;
  /** Short annotation beside the label: `on`, `off`, `disabled`, `in flight`. */
  readonly tag?: string;
  readonly id?: string;
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
  help,
  status,
  tag,
  id,
}: ToggleProps): ReactNode {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const labelId = `${controlId}-label`;
  const helpId = `${controlId}-help`;
  const locked = isLocked(status);
  const inFlight = status.lifecycle === "inFlight";

  return (
    <div className="perch-toggle-row" data-disabled={locked ? "true" : "false"}>
      <Switch.Root
        className="perch-toggle"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={locked}
        data-inflight={inFlight ? "true" : "false"}
        id={controlId}
        // The label span alone: the tag says on/off and the switch reports its
        // own state.
        aria-labelledby={labelId}
        aria-describedby={helpId}
        {...(status.error === undefined ? {} : { "aria-invalid": true })}
      >
        <Switch.Thumb className="perch-toggle__knob" />
      </Switch.Root>

      <div className="perch-toggle-text">
        {/* A real `label`, so the text is a pointer target for the switch as well
            — 36 × 24 px is the minimum, not a comfortable click. */}
        <label className="perch-toggle-text__label" htmlFor={controlId}>
          <span id={labelId}>{label}</span>
          {tag === undefined ? null : <span className="perch-field__tag">{tag}</span>}
        </label>
        {/* Reserved like every other help line: the error replaces the help so a
            refusal does not change the row's height. Pointed at by
            `aria-describedby`, which is what ARCH 13 §10 asks of a form error —
            the live region announces it, the description makes it readable again
            on focus. */}
        <div
          className="perch-toggle-text__help"
          id={helpId}
          data-error={status.error === undefined ? "false" : "true"}
          role="status"
          aria-live="polite"
        >
          {status.error ?? help ?? ""}
        </div>
      </div>
    </div>
  );
}
