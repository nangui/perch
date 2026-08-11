/**
 * The table a resource declares.
 *
 * The columns, which of them may be sorted by, and the actions a row offers.
 * Filters, bulk actions, pagination sizes and the empty state are not here;
 * each needs a route or a renderer that does not exist yet, and an option that
 * does nothing is worse than an absent one.
 */
import type { Action } from "./action.js";
import type { Column } from "./column.js";
import type { SortDirection } from "./data-adapter.js";

export interface TableState {
  readonly columns: readonly Column[];
  readonly actions: readonly Action[];
  readonly headerActions: readonly Action[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
}

/** What crosses the wire, as a `ColumnTree`. */
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
  /**
   * Whether a search reaches anything, which is all the client needs to decide
   * between offering a box and offering nothing. Which columns it reaches is
   * not said: that is the server's business, and naming them would answer a
   * question nobody asked.
   */
  readonly searchable?: true;
  readonly actions: readonly ActionNode[];
  /** What the table offers above itself, rather than on a row. */
  readonly headerActions: readonly ActionNode[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
}

export class Table {
  readonly state: TableState;

  private constructor(state: TableState) {
    this.state = state;
  }

  static make(): Table {
    return new Table({ columns: [], actions: [], headerActions: [] });
  }

  columns(list: readonly Column[]): Table {
    return new Table({ ...this.state, columns: [...list] });
  }

  /** What a row offers. Rendered after the last column. */
  actions(list: readonly Action[]): Table {
    return new Table({ ...this.state, actions: [...list] });
  }

  /** What the table offers as a whole — creating a row, above all. */
  headerActions(list: readonly Action[]): Table {
    return new Table({ ...this.state, headerActions: [...list] });
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
 * `sortable` is sent because the client renders a control from it, and so is a
 * single flag saying whether a search reaches anything at all. Which columns it
 * reaches is not: the client asks for a search, and naming the columns behind
 * it would answer a question nobody asked.
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
    ...(searchablePaths(table).size === 0 ? {} : { searchable: true as const }),
    actions: table.state.actions.map(node),
    headerActions: table.state.headerActions.map(node),
    ...(table.state.defaultSort === undefined
      ? {}
      : { defaultSort: table.state.defaultSort }),
  };
}

function node(action: Action): ActionNode {
  return {
    type: action.type,
    ...(action.state.label === undefined ? {} : { label: action.state.label }),
  };
}

/** The paths a client may sort by: exactly those a column declared. */
export function sortablePaths(table: Table): ReadonlySet<string> {
  return new Set(
    table.state.columns.filter((c) => c.state.sortable).map((c) => c.state.path),
  );
}

/** The paths a search may reach: exactly those a column declared. */
export function searchablePaths(table: Table): ReadonlySet<string> {
  return new Set(
    table.state.columns.filter((c) => c.state.searchable).map((c) => c.state.path),
  );
}
