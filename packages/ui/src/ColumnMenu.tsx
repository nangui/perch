/**
 * Which columns a reader keeps.
 *
 * A wide table is a table somebody narrows: eight columns are useful to the
 * person auditing and in the way of the person looking up a name. Only the
 * columns that said they could be taken off appear here — one a table declared
 * plainly is one its author meant, and offering to remove it would make every
 * table's shape a suggestion.
 *
 * Drawn as a `details` rather than a menu built by hand: it opens on a click,
 * closes on Escape, and is announced as a disclosure without a line of
 * JavaScript. What is inside is checkboxes, because that is what choosing
 * several of a set is, and a reader who knows checkboxes knows this.
 */
import type { ReactNode } from "react";
import type { ColumnNode } from "@perchjs/core";

export interface ColumnMenuProps {
  readonly columns: readonly ColumnNode[];
  /** The paths taken off, which is the shorter list to carry. */
  readonly hidden: ReadonlySet<string>;
  readonly onToggle: (path: string) => void;
}

export function ColumnMenu({ columns, hidden, onToggle }: ColumnMenuProps): ReactNode {
  const offered = columns.filter((one) => one.toggleable === true);
  // No control where nothing may be taken off. A menu that opens on an empty
  // list is a promise the table did not make.
  if (offered.length === 0) return null;

  return (
    <details className="perch-columns">
      <summary className="perch-columns__button">Columns</summary>
      <div className="perch-columns__panel" role="group" aria-label="Columns shown">
        {offered.map((column) => {
          const on = !hidden.has(column.path);
          return (
            <label key={column.path} className="perch-columns__row">
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  onToggle(column.path);
                }}
              />
              {column.label ?? column.path}
            </label>
          );
        })}
      </div>
    </details>
  );
}

/**
 * The columns off at the start, which is what the table declared.
 *
 * Read once when the page arrives rather than kept in step with it: what a
 * reader has taken off since is theirs, and a page turning is not a reason to
 * put it back.
 */
export function hiddenAtFirst(columns: readonly ColumnNode[]): ReadonlySet<string> {
  return new Set(
    columns.filter((one) => one.hiddenByDefault === true).map((one) => one.path),
  );
}
