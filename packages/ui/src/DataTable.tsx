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
import { Fragment, useRef, useState } from "react";
import type {
  ActionNode,
  AggregateValue,
  ColumnNode,
  ColumnTree,
  GroupCount,
  GroupKey,
  Row,
  SortDirection,
  Summary,
} from "@perchjs/core";
import { useDismiss } from "./dismiss.js";
import { formatValue } from "./format.js";
import { EllipsisMark } from "./marks.js";
import { IconMark } from "./icons.js";
import { readPath } from "./read-path.js";
import { lookupColumn } from "./column-registry.js";

export interface DataTableSort {
  readonly path: string;
  readonly direction: SortDirection;
}

/**
 * What a column says about the room it takes, as classes.
 *
 * Classes rather than inline styles, because both of these are the
 * stylesheet's business: one is a rule that only applies below a width, and
 * the other has to be overridable by a theme. A style attribute is the one
 * thing a theme cannot reach.
 */
function shape(column: ColumnNode, base: string): string {
  return [
    base,
    column.alignment === undefined ? "" : `${base}--${column.alignment}`,
    column.hiddenWhenNarrow === true ? `${base}--wide-only` : "",
  ]
    .filter((one) => one !== "")
    .join(" ");
}

/** How many rows a group holds, in words, because a header is read aloud too. */
function said(total: number): string {
  return total === 1 ? "1 row" : `${String(total)} rows`;
}

/** How a group is filed, apart from how it reads. */
function under(key: GroupKey): string {
  return `${typeof key}:${String(key)}`;
}

/**
 * What a group's key says it is.
 *
 * Not put through the grouped column's formatting, and that is a decision: the
 * column a table gathers by need not be drawn at all, so a key that read as
 * money on one table and as a bare number on another would be this renderer
 * guessing rather than a rule anybody wrote.
 *
 * Nothing reads as words rather than as a blank. A header with an empty line
 * above a group of rows looks like a header that failed to load.
 */
function reads(key: GroupKey): string {
  if (key === null) return "No value";
  if (typeof key === "boolean") return key ? "Yes" : "No";
  return String(key);
}

/** What a reader calls each of the four, in a footer. */
const CALLED: Readonly<Record<Summary["of"], string>> = {
  count: "Count",
  sum: "Total",
  avg: "Average",
  range: "Range",
};

/**
 * No value, for a reader.
 *
 * Not a zero. A sum of a column holding nothing but nulls is not nought, and
 * a footer is the one place that difference cannot be taken back, because
 * somebody is reading the number rather than passing it on.
 */
const NOTHING = "\u2013";

/**
 * One line of the footer, as words.
 *
 * A count is a number of rows and takes none of the column's formatting: run
 * through a money rule it would read as an amount and mean a tally. The other
 * three are the column's own kind of value, so they take the column's rule,
 * which is the same call a cell makes and therefore the same answer.
 */
function worded(summary: Summary, column: ColumnNode): string {
  if (summary.of === "count") {
    return summary.value === null ? NOTHING : String(summary.value);
  }
  // Null only: a range's far end is normalised below, and the other three
  // cannot be absent without the server having left a key out of its own type.
  const said = (value: AggregateValue): string =>
    value === null ? NOTHING : (formatValue(value, column) ?? String(value));

  return summary.of === "range"
    ? `${said(summary.value)} to ${said(summary.to ?? null)}`
    : said(summary.value);
}

export interface DataTableProps {
  readonly columns: ColumnTree;
  readonly rows: readonly Row[];
  /**
   * What the footer says, by column path.
   *
   * Worked out on the server over every row a filter left, not over the page,
   * so the number does not change when somebody turns one. Absent means the
   * table has no footer, and a column absent from it has none of its own.
   */
  readonly summaries?: Readonly<Record<string, readonly Summary[]>>;
  /**
   * The size of each group the rows fall into, where the table gathers them.
   *
   * Which column gathers them comes with the shape, as `columns.groupBy`. The
   * sizes are whole groups' and worked out on the server, so a header says how
   * many rows are in the group rather than how many of them this page holds.
   *
   * Collapsing one hides rows the client already has. It saves no read, and a
   * header that fetched would be the N+1 this table exists not to be, one
   * level up.
   */
  readonly groups?: readonly GroupCount[];
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
  summaries,
  groups,
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
  // A link needs an address; a run needs somebody to run it. Applied to what a
  // host hands down as well as to what the server declared — the two end up in
  // the same menu, and one of them being undrawable is the same problem twice.
  const drawable = (list: readonly ActionNode[]): readonly ActionNode[] =>
    list.filter((action) =>
      action.trigger === "link" ? rowHref !== undefined : onAction !== undefined,
    );
  const actions = drawable(columns.actions);
  // The column exists if anything will be in it, which is neither "the server
  // declared something" nor "a host offered to fill it". The first drew a tab's
  // own actions into a column that was never made — a join declares none and
  // offers detaching. The second draws an empty column on every list there is,
  // because the list page always hands down a function. So the rows are asked.
  const anyActions =
    actions.length > 0 ||
    rows.some((row) => drawable(rowActions?.(row) ?? []).length > 0);
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

  // How tall the footer is: the most lines any one column asked for. Counted
  // over the columns being drawn rather than over everything the server sent,
  // so a column the reader took off takes its footer with it.
  //
  // The zero is first because `Math.max` of nothing is negative infinity, and
  // a table with no footer is the common case.
  const lines = Math.max(
    0,
    ...rendered.map(({ column }) => (summaries?.[column.path] ?? []).length),
  );

  // Which groups are shut. Held here and nowhere else: collapsing hides rows
  // the browser already has, so it is the browser's business and the server is
  // not told about it.
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());
  const gathering = columns.groupBy;
  const sizes = new Map((groups ?? []).map((one) => [under(one.key), one.total]));
  const gatheredBy = (row: Row): GroupKey => {
    const held = gathering === undefined ? null : readPath(row, gathering);
    // Anything but these four joins the group holding nothing, which is
    // unreachable: the server refuses a key a database cannot group, and the
    // types it admits arrive as one of these. Stringifying it instead would
    // put the words `object Object` above a group of rows.
    return typeof held === "string" ||
      typeof held === "number" ||
      typeof held === "boolean"
      ? held
      : null;
  };
  // A header opens where the value changes, which is why the server orders the
  // page by it: the client reads boundaries off the rows and works out nothing
  // else.
  const opens = (index: number): boolean => {
    if (gathering === undefined) return false;
    const row = rows[index];
    const before = rows[index - 1];
    if (row === undefined) return false;
    return before === undefined || under(gatheredBy(before)) !== under(gatheredBy(row));
  };
  // One more cell than the columns where a tick column or an actions column is
  // there, so a header spans the row rather than stopping short of it.
  const across =
    rendered.length + (selection === undefined ? 0 : 1) + (anyActions ? 1 : 0);

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
              className={shape(column, "perch-table__head")}
              // The width is asked for once, on the heading: a table divides
              // what it has by its columns, and saying it on every cell would
              // be saying it five hundred times to no further effect.
              {...(column.width === undefined
                ? {}
                : { style: { width: column.width } })}
            >
              {header(column, sort, onSort)}
            </th>
          ))}
          {anyActions ? (
            <th scope="col" className="perch-table__head">
              <span className="perch-visually-hidden">Actions</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const key = gatheredBy(row);
          const filed = under(key);
          const closed = shut.has(filed);
          return (
            <Fragment key={rowKey(row, index)}>
              {!opens(index) ? null : (
                <tr className="perch-table__group">
                  <th
                    scope="colgroup"
                    colSpan={across}
                    className="perch-table__group-head"
                  >
                    <button
                      type="button"
                      className="perch-table__group-toggle"
                      aria-expanded={!closed}
                      onClick={() => {
                        setShut((was) => {
                          const next = new Set(was);
                          if (!next.delete(filed)) next.add(filed);
                          return next;
                        });
                      }}
                    >
                      <span aria-hidden="true" className="perch-table__group-mark">
                        {closed ? "\u25b8" : "\u25be"}
                      </span>
                      <span className="perch-table__group-key">{reads(key)}</span>
                      {/* The whole group's size, which is why it is sent
                          rather than counted here: the page holds a part of
                          it. */}
                      <span className="perch-table__group-size">
                        {sizes.has(filed) ? said(sizes.get(filed) ?? 0) : ""}
                      </span>
                    </button>
                  </th>
                </tr>
              )}
              {closed ? null : (
                <tr data-picked={isPicked(row)}>
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
                    <td
                      key={column.path}
                      {...(column.extraAttributes ?? {})}
                      // After the author's own, never before: what a cell says about
                      // itself is not theirs to overwrite, and `data-label` below is
                      // the only thing naming this column once a row is a stack. The
                      // boot refuses these by name too, so this is the second of two
                      // answers rather than the only one.
                      className={shape(column, "perch-table__cell")}
                      // Carried on every cell, read by the stylesheet only where the
                      // window is too narrow for a row to be a row. A heading above
                      // eight columns is no use when they are stacked, so each cell
                      // says what it is — and it says it in the markup rather than in
                      // a second render pass, because a cell is drawn by one
                      // memoised function per column type and that stays true.
                      data-label={column.label ?? column.path}
                    >
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
                  {anyActions ? (
                    <td className="perch-table__cell perch-table__actions">
                      <RowActions
                        actions={rowActions === undefined ? actions : rowActions(row)}
                        row={row}
                        {...(rowHref === undefined ? {} : { href: rowHref })}
                        {...(onAction === undefined ? {} : { onAction })}
                        busy={actionsBusy}
                      />
                    </td>
                  ) : null}
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
      {lines === 0 ? null : (
        <tfoot className="perch-table__foot">
          {/* One row per line a column asked for, so a column wanting a total
              and an average lines up under itself rather than beside the next
              column's. The height is the deepest column's, and a column with
              nothing to say at that depth draws an empty cell. */}
          {Array.from({ length: lines }, (_, depth) => (
            <tr key={depth}>
              {selection === undefined ? null : (
                <td className="perch-table__cell perch-table__pick" />
              )}
              {rendered.map(({ column }) => {
                const summary = (summaries?.[column.path] ?? [])[depth];
                return (
                  <td key={column.path} className={shape(column, "perch-table__cell")}>
                    {summary === undefined ? null : (
                      <>
                        {/* Named in every cell rather than once at the end of
                            the row: a row read out loud has to say what each
                            number is, and there is no spare cell at the start
                            of a table that has no checkboxes. */}
                        <span className="perch-table__summary-name">
                          {CALLED[summary.of]}
                        </span>
                        <span className="perch-table__summary-value">
                          {worded(summary, column)}
                        </span>
                      </>
                    )}
                  </td>
                );
              })}
              {anyActions ? <td className="perch-table__cell" /> : null}
            </tr>
          ))}
        </tfoot>
      )}
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
          <IconMark name={action.icon} className="perch-table__action-group-icon" />
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
  const shell = useRef<HTMLDetailsElement | null>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useDismiss(shell);

  const drawn = actions
    .map((action) => rowAction(action, row, href, onAction, busy))
    .filter((one) => one !== null);
  if (drawn.length === 0) return null;

  return (
    <details
      className="perch-row-actions"
      ref={shell}
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
        <EllipsisMark />
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
