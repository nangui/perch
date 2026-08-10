/**
 * The table a resource declares — PRD 07 §3.
 *
 * The columns, which of them may be sorted by, and the actions a row offers.
 * Filters, bulk actions, pagination sizes and the empty state are in the same
 * PRD and are not here; each needs a route or a renderer that does not exist
 * yet, and an option that does nothing is worse than an absent one.
 */
import type { Action } from "./action.js";
import type { Column } from "./column.js";
import type { SortDirection } from "./data-adapter.js";

export interface TableState {
  readonly columns: readonly Column[];
  readonly actions: readonly Action[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
}

/** What crosses the wire. `ColumnTree` is PRD 03's name for it. */
export interface ColumnNode {
  /** Keys the renderer registry. */
  readonly type: string;
  readonly path: string;
  readonly label?: string;
  readonly sortable?: true;
  readonly boolean?: true;
}

/** What a row action looks like on the wire. */
export interface ActionNode {
  readonly type: string;
  readonly label?: string;
}

export interface ColumnTree {
  readonly columns: readonly ColumnNode[];
  readonly actions: readonly ActionNode[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
}

export class Table {
  readonly state: TableState;

  private constructor(state: TableState) {
    this.state = state;
  }

  static make(): Table {
    return new Table({ columns: [], actions: [] });
  }

  columns(list: readonly Column[]): Table {
    return new Table({ ...this.state, columns: [...list] });
  }

  /** What a row offers. Rendered after the last column. */
  actions(list: readonly Action[]): Table {
    return new Table({ ...this.state, actions: [...list] });
  }

  /**
   * Where the table opens. Not checked against the columns here: a sort the
   * client asks for is refused at the boundary, and one the resource declares
   * is the resource's own business.
   */
  defaultSort(path: string, direction: SortDirection = "asc"): Table {
    return new Table({ ...this.state, defaultSort: { path, direction } });
  }
}

/**
 * The tree the client receives.
 *
 * `sortable` is sent because the client renders a control from it. Nothing else
 * about the server's own capabilities is: the client asks for a search, it does
 * not need to be told which columns one reaches.
 */
export function serialiseTable(table: Table): ColumnTree {
  return {
    columns: table.state.columns.map((column) => ({
      type: column.type,
      path: column.state.path,
      ...(column.state.label === undefined ? {} : { label: column.state.label }),
      ...(column.state.sortable ? { sortable: true as const } : {}),
      ...(column.state.boolean === undefined ? {} : { boolean: true as const }),
    })),
    actions: table.state.actions.map((action) => ({
      type: action.type,
      ...(action.state.label === undefined ? {} : { label: action.state.label }),
    })),
    ...(table.state.defaultSort === undefined
      ? {}
      : { defaultSort: table.state.defaultSort }),
  };
}

/** The paths a client may sort by: exactly those a column declared. */
export function sortablePaths(table: Table): ReadonlySet<string> {
  return new Set(
    table.state.columns.filter((c) => c.state.sortable).map((c) => c.state.path),
  );
}
