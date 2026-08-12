/**
 * `Placeholder` — a reading, in the shape of a control.
 *
 * Control-shaped rather than a bare line of text, because it sits in a column
 * of fields and the eye reads that column as a column. Not a control though:
 * nothing focusable, nothing to tab to, no `aria-disabled` pretending there is
 * something here that might have been usable.
 *
 * The label is the shell's. This draws the value and nothing else.
 */
import type { ReactNode } from "react";
import type { FieldStatus } from "../field-state.js";
import { statusAttributes } from "../field-state.js";

export interface PlaceholderProps {
  /** Already computed by the server. Absent is a legitimate answer. */
  readonly content?: string;
  readonly status: FieldStatus;
  /** Points the shell's help line at this, so the two are read together. */
  readonly describedBy: string;
}

export function Placeholder({
  content,
  status,
  describedBy,
}: PlaceholderProps): ReactNode {
  return (
    <p className="perch-placeholder" id={describedBy} {...statusAttributes(status)}>
      {content ?? ""}
    </p>
  );
}
