/**
 * The pairs in a `Json` column, as a table of two named columns.
 *
 * A table rather than the run of boxes the form draws: these are data, and two
 * columns with names is what a table is for. The names are real headings, so a
 * reader who is not looking at the page is still told which column a cell is
 * in — where the form has to hide its headings, because each of its cells is a
 * box carrying its own name already.
 *
 * It converts nothing. The rows were read on the server, out of a shape nobody
 * here chose; this half draws what it was handed.
 */
import type { ReactNode } from "react";

export interface KeyValueEntryProps {
  /** The rows, already read. Absent where the column held no object to read. */
  readonly pairs?: readonly (readonly [string, string])[];
  /** What the column held, where it was not an object: shown as the JSON it is. */
  readonly value?: unknown;
  /** The heading the shell wrote above, for what the table is called. */
  readonly labelledBy?: string;
  readonly keyLabel?: string;
  readonly valueLabel?: string;
  readonly placeholder?: string;
  readonly describedBy?: string;
}

export function KeyValueEntry({
  pairs,
  value,
  labelledBy,
  keyLabel = "Key",
  valueLabel = "Value",
  placeholder,
  describedBy,
}: KeyValueEntryProps): ReactNode {
  if (pairs === undefined) {
    // The column held something that is not a flat object. Drawn as the JSON
    // it is, rather than as an empty table: a table with no rows says the
    // column is empty, and this is the case where it is not.
    const said =
      value === undefined || value === null ? undefined : JSON.stringify(value);
    return (
      <p
        className="perch-entry"
        id={describedBy}
        {...(said === undefined ? { "data-empty": true } : {})}
      >
        {said ?? placeholder ?? "—"}
      </p>
    );
  }

  if (pairs.length === 0) {
    return (
      <p className="perch-entry" data-empty="true" id={describedBy}>
        {placeholder ?? "—"}
      </p>
    );
  }

  return (
    <table
      className="perch-entry perch-pairs"
      id={describedBy}
      // Named by the heading the shell wrote above. A `label for` names a form
      // control and a table is not one, so the shell writes a heading instead
      // and this points at it — a table being a thing a reader navigates *to*,
      // listed by name, and unnamed among the others without this.
      {...(labelledBy === undefined ? {} : { "aria-labelledby": labelledBy })}
    >
      <thead>
        <tr>
          <th scope="col">{keyLabel}</th>
          <th scope="col">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map(([key, held]) => (
          // By key: the rows are read, not typed into, and a key is what makes
          // one of them the row it is.
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{held}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
