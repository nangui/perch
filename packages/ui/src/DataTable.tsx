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
  readonly rowHref?: (row: Row) => string | undefined;
}

export function DataTable({
  columns,
  rows,
  sort,
  onSort,
  caption,
  empty,
  rowHref,
}: DataTableProps): ReactNode {
  const actions = rowHref === undefined ? [] : columns.actions;
  // One lookup per column, before any row is touched.
  const rendered = columns.columns.map((column) => ({
    column,
    render: lookupColumn(column.type),
  }));

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
          <tr key={rowKey(row, index)}>
            {rendered.map(({ column, render }) => (
              <td key={column.path} className="perch-table__cell">
                {render === undefined
                  ? unknownColumn(column)
                  : render(readPath(row, column.path), row, column)}
              </td>
            ))}
            {actions.length === 0 || rowHref === undefined ? null : (
              <td className="perch-table__cell perch-table__actions">
                {actions.map((action) => rowAction(action, row, rowHref))}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A row action, as a link.
 *
 * `EditAction` is navigation, so it is an anchor rather than a button: it goes
 * somewhere, and the browser's own affordances — open in a new tab, copy the
 * address — come with saying so honestly.
 *
 * A row the server gave no address for offers nothing rather than a dead link.
 */
function rowAction(
  action: ActionNode,
  row: Row,
  href: (row: Row) => string | undefined,
): ReactNode {
  if (action.type !== "EditAction") return null;
  const target = href(row);
  if (target === undefined) return null;

  return (
    <a key={action.type} className="perch-table__action" href={target}>
      {action.label ?? "Edit"}
    </a>
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
