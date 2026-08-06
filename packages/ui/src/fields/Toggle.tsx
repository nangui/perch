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
 */
import type { ReactNode } from "react";
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
        {...(id === undefined ? {} : { id })}
        {...(status.error === undefined ? {} : { "aria-invalid": true })}
      >
        <Switch.Thumb className="perch-toggle__knob" />
      </Switch.Root>

      <div className="perch-toggle-text">
        <div className="perch-toggle-text__label">
          <span>{label}</span>
          {tag === undefined ? null : <span className="perch-field__tag">{tag}</span>}
        </div>
        {/* Reserved like every other help line: the error replaces the help so a
            refusal does not change the row's height. */}
        <div
          className="perch-toggle-text__help"
          role="status"
          aria-live="polite"
          {...(status.error === undefined
            ? {}
            : { style: { color: "var(--perch-danger-content)" } })}
        >
          {status.error ?? help ?? ""}
        </div>
      </div>
    </div>
  );
}
