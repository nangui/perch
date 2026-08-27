/**
 * The table.
 *
 * The renderer is looked up **once per column**, not once per cell, and the row
 * loop calls it. That is the whole of "one render function memoized per column
 * type": a hundred rows of five columns are five lookups and five hundred
 * function calls, not five hundred component mounts.
 *
 * There is no `<Cell>` component here on purpose. Adding one is the change that
 * cost Filament a rewrite, and it would look like an improvement.
 */
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type {
  ActionNode,
  ColumnNode,
  ColumnTree,
  Row,
  SortDirection,
} from "@perchjs/core";
import { lookupColumn } from "./column-registry.js";

export interface DataTableSort {
  readonly path: string;
  readonly direction: SortDirection;
}

export interface DataTableProps {
  readonly columns: ColumnTree;
  readonly rows: readonly Row[];
  /** Which column is ordering the page, if the server was asked for one. */
  readonly sort?: DataTableSort;
  /** Absent means the table cannot be reordered from here. */
  readonly onSort?: (sort: DataTableSort) => void;
  readonly caption: string;
  readonly empty?: ReactNode;
  /**
   * Where a row action points. The server builds it — `${editPath}/${key}/edit`
   * — because the panel's own root is the server's to know, not the browser's
   * to reconstruct from the API path it was handed.
   */
  /** Asked per action: two links on one row lead to two different pages. */
  readonly rowHref?: (action: ActionNode, row: Row) => string | undefined;
  /**
   * Runs an action against a row. Absent means the table draws no run actions —
   * nobody would carry them out, and a button that does nothing is worse than
   * no button.
   */
  readonly onAction?: (action: ActionNode, row: Row) => void;
  /** Something is already running. The buttons say so rather than look live. */
  readonly actionsBusy?: boolean;
  /**
   * Writes one cell. Absent means the table draws no cell controls at all —
   * nobody would carry them out, and a switch that does not switch is worse
   * than a tick that never claimed to.
   */
  readonly onCellWrite?: (row: Row, column: ColumnNode, value: unknown) => void;
  /** Whether a write is in flight for this cell. */
  readonly cellPending?: (row: Row, column: ColumnNode) => boolean;
  /**
   * What was asked for, while it is in flight. Undefined once the answer has
   * landed, at which point the row holds whatever the server said.
   */
  readonly cellAsked?: (row: Row, column: ColumnNode) => unknown;
  /**
   * Which actions this row can be given, out of the ones the table declared.
   *
   * A restore belongs on a marked row and a delete on a live one; offering
   * either where it does nothing is a button a reader presses to no effect.
   * Absent means every action is offered on every row.
   */
  readonly rowActions?: (row: Row) => readonly ActionNode[];
  /**
   * Ticking rows. Absent means the table offers none — nothing would be done
   * with a selection, and a checkbox that leads nowhere is furniture.
   */
  readonly selection?: {
    readonly keyOf: (row: Row) => string | number | undefined;
    readonly picked: ReadonlySet<string>;
    readonly onPick: (key: string, picked: boolean) => void;
    readonly onPickAll: (picked: boolean) => void;
  };
}

/** The column types a row can be named by. */
const READS_TEXT = new Set(["TextColumn", "TextInputColumn"]);

export function DataTable({
  columns,
  rows,
  sort,
  onSort,
  caption,
  empty,
  rowHref,
  onAction,
  actionsBusy = false,
  rowActions,
  selection,
  onCellWrite,
  cellPending,
  cellAsked,
}: DataTableProps): ReactNode {
  // A link needs an address; a run needs somebody to run it. An action whose
  // kind the host cannot serve is left out rather than drawn dead.
  const actions = columns.actions.filter((action) =>
    action.trigger === "link" ? rowHref !== undefined : onAction !== undefined,
  );
  /**
   * What a row is called, for whatever inside it needs a name of its own.
   *
   * The first text column with something in it. Not the first string in the
   * row: a projected row carries an avatar's address as readily as a name, and
   * a control announced as a file path is worse than one announced twice.
   */
  /**
   * What a cell was asked to become, until the server answers about it.
   *
   * Handed beside the row's value rather than in place of it: a control the
   * reader cannot type into needs it to move when pressed, and one they can
   * type into is already showing what they typed.
   */
  const asked = (row: Row, column: ColumnNode): { asked?: unknown } => {
    if (cellPending?.(row, column) !== true) return {};
    const value = cellAsked?.(row, column);
    return value === undefined ? {} : { asked: value };
  };

  // Editable or not, a column of text is what a reader reads the row by.
  const reading = columns.columns.filter((column) => READS_TEXT.has(column.type));
  const named = (row: Row): { rowName?: string } => {
    for (const column of reading) {
      const held = readPath(row, column.path);
      if (typeof held === "string" && held.trim() !== "") return { rowName: held };
    }
    return {};
  };

  // One lookup per column, before any row is touched.
  const rendered = columns.columns.map((column) => ({
    column,
    render: lookupColumn(column.type),
  }));

  // Read once for the header rather than per row, and only over the rows this
  // page actually holds: "all" means all of what is on screen.
  const pickable =
    selection === undefined
      ? []
      : rows.map((row) => selection.keyOf(row)).filter((key) => key !== undefined);
  const isPicked = (row: Row): boolean => {
    const key = selection?.keyOf(row);
    return (
      key !== undefined && selection !== undefined && selection.picked.has(String(key))
    );
  };
  const allPicked =
    pickable.length > 0 &&
    pickable.every((key) => selection?.picked.has(String(key)) === true);
  const somePicked = pickable.some(
    (key) => selection?.picked.has(String(key)) === true,
  );

  if (rows.length === 0) {
    return (
      <div className="perch-table__empty" role="status">
        {empty ?? "Nothing to show."}
      </div>
    );
  }

  return (
    <table className="perch-table">
      <caption className="perch-visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {selection === undefined ? null : (
            <th scope="col" className="perch-table__head perch-table__pick">
              {/* The real input is transparent and the box beside it is what
                  is seen, which is the pairing every checkbox here uses. On its
                  own the input is invisible. */}
              <span className="perch-checkbox">
                <input
                  type="checkbox"
                  className="perch-checkbox__input"
                  // Ticks what is on this page, and says so. It cannot speak
                  // for rows the server has not sent.
                  aria-label="Select every row on this page"
                  checked={allPicked}
                  ref={(input) => {
                    // Some picked but not all: neither state is true, and the
                    // platform has a third one for exactly this.
                    if (input !== null) input.indeterminate = somePicked && !allPicked;
                  }}
                  onChange={(event) => {
                    selection.onPickAll(event.target.checked);
                  }}
                />
                <span className="perch-checkbox__box" aria-hidden="true">
                  {allPicked ? "✓" : somePicked ? "–" : ""}
                </span>
              </span>
            </th>
          )}
          {rendered.map(({ column }) => (
            <th
              key={column.path}
              scope="col"
              aria-sort={ariaSort(column, sort, onSort !== undefined)}
              className="perch-table__head"
            >
              {header(column, sort, onSort)}
            </th>
          ))}
          {actions.length === 0 ? null : (
            <th scope="col" className="perch-table__head">
              <span className="perch-visually-hidden">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row, index)} data-picked={isPicked(row)}>
            {selection === undefined ? null : (
              <td className="perch-table__cell perch-table__pick">
                <span className="perch-checkbox">
                  <input
                    type="checkbox"
                    className="perch-checkbox__input"
                    aria-label={`Select row ${String(index + 1)}`}
                    checked={isPicked(row)}
                    disabled={selection.keyOf(row) === undefined}
                    onChange={(event) => {
                      const key = selection.keyOf(row);
                      if (key !== undefined)
                        selection.onPick(String(key), event.target.checked);
                    }}
                  />
                  <span className="perch-checkbox__box" aria-hidden="true">
                    {isPicked(row) ? "✓" : ""}
                  </span>
                </span>
              </td>
            )}
            {rendered.map(({ column, render }) => (
              <td key={column.path} className="perch-table__cell">
                {render === undefined
                  ? unknownColumn(column)
                  : render(readPath(row, column.path), row, column, {
                      // Offered only where the server said this reader may and
                      // the host said it would carry one out. Either missing is
                      // a control that does nothing.
                      ...(column.editable === true && onCellWrite !== undefined
                        ? {
                            write: (value: unknown) => {
                              onCellWrite(row, column, value);
                            },
                          }
                        : {}),
                      pending: cellPending?.(row, column) === true,
                      ...asked(row, column),
                      ...named(row),
                    })}
              </td>
            ))}
            {actions.length === 0 ? null : (
              <td className="perch-table__cell perch-table__actions">
                <RowActions
                  actions={rowActions === undefined ? actions : rowActions(row)}
                  row={row}
                  {...(rowHref === undefined ? {} : { href: rowHref })}
                  {...(onAction === undefined ? {} : { onAction })}
                  busy={actionsBusy}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A row action.
 *
 * A link is an anchor rather than a button: it goes somewhere, and the
 * browser's own affordances — open in a new tab, copy the address — come with
 * saying so honestly. A run is a button, because it is a request.
 *
 * Which of the two is the server's word, not a guess from the type name. An
 * action added to the framework later behaves correctly here without this file
 * having heard of it.
 *
 * A row the server gave no address for offers no link rather than a dead one.
 */
function rowAction(
  action: ActionNode,
  row: Row,
  href: ((action: ActionNode, row: Row) => string | undefined) | undefined,
  onAction: ((action: ActionNode, row: Row) => void) | undefined,
  busy: boolean,
): ReactNode {
  // A section inside the menu rather than a menu inside it. The row's actions
  // are already behind one control, and a second dropdown opening out of the
  // first is a shape a pointer loses and a keyboard cannot follow — so a group
  // becomes a heading with its own items under it.
  if (action.trigger === "group") {
    const inside = (action.children ?? [])
      .map((one) => rowAction(one, row, href, onAction, busy))
      .filter((one) => one !== null);
    if (inside.length === 0) return null;

    return (
      <div
        key={action.name}
        className="perch-table__action-group"
        role="group"
        aria-label={action.label ?? action.name}
      >
        <p className="perch-table__action-group-label" aria-hidden="true">
          {action.icon === undefined ? null : <span>{action.icon}</span>}
          {action.label ?? action.name}
        </p>
        {inside}
      </div>
    );
  }

  if (action.trigger === "link") {
    const target = href?.(action, row);
    if (target === undefined) return null;
    return (
      <a key={action.name} className="perch-table__action" href={target}>
        {action.label ?? defaultLabel(action)}
      </a>
    );
  }

  if (onAction === undefined) return null;
  return (
    <button
      key={action.name}
      type="button"
      className={`perch-table__action${action.danger === true ? " perch-table__action--danger" : ""}`}
      disabled={busy}
      onClick={(event) => {
        // Folded before whatever this opens. A `<details>` stays open on its
        // own, so the menu sat above the dimmed page behind the dialog it had
        // just opened — a list of things to press, over a modal that had taken
        // the focus away from all of them.
        event.currentTarget.closest("details")?.removeAttribute("open");
        onAction(action, row);
      }}
    >
      {action.label ?? defaultLabel(action)}
    </button>
  );
}

/** A label the author did not give. Named after the action, never blank. */
/**
 * The type, as words. `ForceDeleteAction` is a class name and `ForceDelete` is
 * still one — a button says "Force delete".
 */
/**
 * What to call an action that did not say.
 *
 * Exported because three places needed it and two had written their own: the
 * row menu, the bulk bar, and the heading of a dialog a view opens in. A
 * built-in action reading `View` in the menu and `ViewAction` at the top of
 * what it opened is one word too many for a reader to have to reconcile.
 */
export function defaultLabel(action: ActionNode): string {
  const words = action.type.replace(/Action$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0) + words.slice(1).toLowerCase();
}

/**
 * A row's actions, behind one control.
 *
 * Six spelled out on every row is a wall of words competing with the values
 * they sit beside, and the reader scans past all of them. One button opens
 * them, which is also the shape that stays honest when a row has ten.
 *
 * A `<details>` rather than a handmade popover: it opens on click and on Enter,
 * closes on Escape, is in the tab order once, and needs no JavaScript to be
 * operable at all.
 */
function RowActions({
  actions,
  row,
  href,
  onAction,
  busy,
}: {
  readonly actions: readonly ActionNode[];
  readonly row: Row;
  readonly href?: (action: ActionNode, row: Row) => string | undefined;
  readonly onAction?: (action: ActionNode, row: Row) => void;
  readonly busy: boolean;
}): ReactNode {
  const open = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);

  const drawn = actions
    .map((action) => rowAction(action, row, href, onAction, busy))
    .filter((one) => one !== null);
  if (drawn.length === 0) return null;

  return (
    <details
      className="perch-row-actions"
      onToggle={(event) => {
        // Placed when it opens, against the viewport. The table scrolls
        // sideways for a wide one, and a scrolling box clips in both
        // directions whatever the z-index says — so a menu positioned inside
        // it is cut off at the last row, which is what this was.
        const details = event.currentTarget;
        if (!details.open) {
          setAt(null);
          return;
        }
        const box = open.current?.getBoundingClientRect();
        if (box !== undefined)
          setAt({ top: box.bottom, right: window.innerWidth - box.right });
      }}
    >
      <summary className="perch-row-actions__open" aria-label="Actions" ref={open}>
        <span aria-hidden="true">⋯</span>
      </summary>
      {/* Held back until it has somewhere to be: a fixed box painted before it
          is placed lands wherever the flow left it. Kept in the tree all the
          same — a `<details>` holds its content and folds it, and a screen
          reader is told as much. */}
      <div
        className="perch-row-actions__menu"
        data-placed={at !== null}
        {...(at === null
          ? {}
          : { style: { top: `${String(at.top)}px`, right: `${String(at.right)}px` } })}
      >
        {drawn}
      </div>
    </details>
  );
}

/**
 * A sortable header is a button, because a header has to be actionable from the
 * keyboard and a click handler on a `<th>` is not.
 */
function header(
  column: ColumnNode,
  sort: DataTableSort | undefined,
  onSort: ((sort: DataTableSort) => void) | undefined,
): ReactNode {
  const label = column.label ?? column.path;
  if (column.sortable !== true || onSort === undefined) return label;

  const next: SortDirection =
    sort?.path === column.path && sort.direction === "asc" ? "desc" : "asc";

  return (
    <button
      type="button"
      className="perch-table__sort"
      onClick={() => {
        onSort({ path: column.path, direction: next });
      }}
    >
      {label}
      <span aria-hidden className="perch-table__sort-mark">
        {sort?.path === column.path ? (sort.direction === "asc" ? "↑" : "↓") : ""}
      </span>
    </button>
  );
}

/**
 * Says nothing unless the header can actually be acted on.
 *
 * `sortable` is the server's word and `onSort` is whether this table can do
 * anything with it. Announcing `aria-sort="none"` on a header with no control
 * tells a screen reader the column can be reordered, and it cannot.
 */
function ariaSort(
  column: ColumnNode,
  sort: DataTableSort | undefined,
  actionable: boolean,
): "ascending" | "descending" | "none" | undefined {
  if (column.sortable !== true || !actionable) return undefined;
  if (sort?.path !== column.path) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

/**
 * A type nobody registered. Visible rather than blank: an unknown component
 * shows a marker instead of disappearing, and a blank cell reads as missing
 * data rather than as a missing renderer.
 */
function unknownColumn(column: ColumnNode): ReactNode {
  return (
    <span className="perch-table__unknown" title={`No renderer for ${column.type}`}>
      ?
    </span>
  );
}

/**
 * Reads `author.name` out of a row.
 *
 * Core has this function and `@perchjs/ui` may not call it: the renderer gets
 * *types* from the domain and no values, because core is not a runtime
 * dependency of this package and an import that compiles here would fail for
 * whoever installs it. Eight lines is what that boundary costs, and
 * `boundaries.test.ts` is what noticed.
 */
function readPath(row: Row, path: string): unknown {
  let cursor: unknown = row;
  for (const segment of path.split(".")) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * A React key, and only that.
 *
 * `id` by convention, index otherwise — the tree does not carry the name of the
 * model's primary key, so a model keyed on `uuid` falls back. That is fine here
 * (a page is replaced wholesale, and the index is stable within it) and will not
 * be the moment a row-level action needs to name the row it acts on. The tree
 * gains the key's name then, with the consumer that needs it.
 */
function rowKey(row: Row, index: number): string {
  const id = row["id"];
  return typeof id === "string" || typeof id === "number" ? String(id) : String(index);
}
