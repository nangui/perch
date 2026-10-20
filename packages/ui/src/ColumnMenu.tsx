/**
 * Which columns a reader keeps.
 *
 * A wide table is a table somebody narrows: eight columns are useful to the
 * person auditing and in the way of the person looking up a name. Only the
 * columns that said they could be taken off appear here — one a table declared
 * plainly is one its author meant, and offering to remove it would make every
 * table's shape a suggestion.
 *
 * The same Radix menu a row's actions open, holding one checkable item per
 * column, because that is what choosing several of a set is in a menu. It was a
 * `details` holding checkboxes: placed by hand under its button, closed by a
 * hook written for it, and walked through with Tab one box at a time. The menu
 * opens on the arrows and Enter as well as a click, moves with the arrows and by
 * typing a letter, keeps itself inside the window and gives the focus back to
 * its button on Escape.
 *
 * Choosing an item does not close the menu. Taking three columns off is three
 * choices in a row, and a menu that shut after each would be opened three times.
 */
import type { ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ColumnNode } from "@perchjs/core";
import { headingOf } from "./heading.js";
import { ChevronDown } from "./marks.js";

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
    // Not modal, as a row's menu is not: the table under it stays readable,
    // and a column taken off is seen going while the menu is still open.
    <Menu.Root modal={false}>
      <Menu.Trigger className="perch-columns__button">
        Columns
        <span className="perch-columns__chevron" aria-hidden="true">
          <ChevronDown />
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="perch-columns__menu"
          align="end"
          sideOffset={4}
          collisionPadding={8}
        >
          {offered.map((column) => (
            <Menu.CheckboxItem
              key={column.path}
              className="perch-columns__item"
              checked={!hidden.has(column.path)}
              onCheckedChange={() => {
                onToggle(column.path);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              <span className="perch-columns__check" aria-hidden="true">
                <Menu.ItemIndicator>✓</Menu.ItemIndicator>
              </span>
              {headingOf(column)}
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
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
