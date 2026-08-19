/**
 * `TextEntry` — a value from the record, read.
 *
 * Not a control and not shaped like one. A field's box says "this is yours to
 * change"; there is nothing to change here, so the value is set as text and the
 * label above it does the work a legend does.
 *
 * Selectable, because the commonest thing anybody does with a value on a read
 * page is copy it.
 */
import type { ReactNode } from "react";

export interface TextEntryProps {
  /** Whatever the record held. Absent, null and empty all read as nothing. */
  readonly value?: unknown;
  /** Shown in place of nothing, so a blank line is never left to be read. */
  readonly placeholder?: string;
  /** Points the shell's help line at this, so the two are read together. */
  readonly describedBy: string;
}

/** Anything the wire can carry, as one line. Objects are nobody's to guess at. */
function text(value: unknown): string | undefined {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function TextEntry({
  value,
  placeholder,
  describedBy,
}: TextEntryProps): ReactNode {
  const shown = text(value);

  return (
    <p className="perch-entry" id={describedBy} data-empty={shown === undefined}>
      {shown ?? placeholder ?? "—"}
    </p>
  );
}
