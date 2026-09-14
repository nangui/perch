/**
 * The mark an infolist shows in place of a word.
 *
 * It draws what it was handed and decides nothing. Which shape and which colour
 * were settled on the server, from the record, by a rule the resource wrote —
 * so there is no map here to keep in step with one over there.
 *
 * Named rather than hidden, unlike every other mark the panel draws. Those sit
 * beside words that already say it; this one is the value, and a tick nobody
 * announces is a row that reads as empty.
 */
import type { ReactNode } from "react";
import { hasDrawing, IconMark } from "../icons.js";

export interface IconEntryProps {
  /** The name the server resolved, or nothing where it resolved to nothing. */
  readonly mark?: string;
  /** Which of the panel's four, when the rule chose one. */
  readonly tone?: string;
  /** What the mark is announced as: the entry's own label. */
  readonly label?: string;
  /** Shown where the record had nothing to show. */
  readonly placeholder?: string;
  readonly describedBy?: string;
}

export function IconEntry({
  mark,
  tone,
  label,
  placeholder,
  describedBy,
}: IconEntryProps): ReactNode {
  // Nothing there, said plainly. A third mark for "neither" would read as a
  // value the record does not hold.
  //
  // A name nothing can draw counts as nothing here, and that is the opposite of
  // what a decoration does. Elsewhere an unknown name draws nothing and the
  // words beside it still say everything; here the mark is the value, so
  // drawing nothing would leave a row that is blank to the eye and silent to a
  // reader. It falls back to the same words an empty record gets.
  if (mark === undefined || !hasDrawing(mark)) {
    return (
      <p className="perch-entry" data-empty="true" id={describedBy}>
        {placeholder ?? "—"}
      </p>
    );
  }

  return (
    <p className="perch-entry" id={describedBy}>
      <IconMark
        name={mark}
        className="perch-entry__mark"
        label={label === undefined || label === "" ? mark : label}
        {...(tone === undefined ? {} : { tone })}
      />
    </p>
  );
}
