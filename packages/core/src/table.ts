/**
 * The table a resource declares.
 *
 * The columns, which of them may be sorted by or searched, the filters a
 * reader can narrow it with, and the actions a row offers. Bulk actions,
 * pagination sizes and the empty state are not here; each needs a route or a
 * renderer that does not exist yet, and an option that does nothing is worse
 * than an absent one.
 */
import type { Action, Confirmation } from "./action.js";
import type { Column } from "./column.js";
import type { Filter } from "./filter.js";
import { SelectFilter } from "./filter.js";
import type { SortDirection } from "./data-adapter.js";

export interface TableState {
  readonly columns: readonly Column[];
  readonly filters: readonly Filter[];
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

/**
 * What a filter looks like on the wire: enough to draw a control, and nothing
 * about what it does. The path and the comparison stay on the server, because
 * sending them would suggest they were open to discussion.
 */
export interface FilterNode {
  readonly type: string;
  readonly name: string;
  readonly label?: string;
  /** What a choice may be set to. Absent where a filter has no closed set. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

/** What a row action looks like on the wire. */
export interface ActionNode {
  readonly type: string;
  /** What a request calls it. The client sends this back, not the type. */
  readonly name: string;
  /** A link the browser follows, or a request it makes. */
  readonly trigger: "link" | "run";
  readonly label?: string;
  /** Present when the reader is asked first. Its absence means it is not. */
  readonly confirmation?: Confirmation;
  readonly danger?: true;
}

export interface ColumnTree {
  readonly columns: readonly ColumnNode[];
  readonly filters: readonly FilterNode[];
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
    return new Table({ columns: [], filters: [], actions: [], headerActions: [] });
  }

  /** What a reader can narrow the table with. */
  filters(list: readonly Filter[]): Table {
    return new Table({ ...this.state, filters: [...list] });
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
    filters: table.state.filters.map((filter) => ({
      type: filter.type,
      name: filter.state.name,
      ...(filter.state.label === undefined ? {} : { label: filter.state.label }),
      // Stringified: a value crosses the wire as what a control will send back,
      // and the declaration turns it into what the column holds on the way in.
      ...(filter instanceof SelectFilter
        ? {
            options: filter.choices.map((option) => ({
              value: String(option.value),
              label: option.label,
            })),
          }
        : {}),
    })),
    actions: table.state.actions.map(node),
    headerActions: table.state.headerActions.map(node),
    ...(table.state.defaultSort === undefined
      ? {}
      : { defaultSort: table.state.defaultSort }),
  };
}

/**
 * What the client is told about an action.
 *
 * The callback and the guard are not on this list, and their absence is the
 * point: a function is not serialisable, and an action's body is not the
 * client's business. What crosses is what a button needs to draw
 * itself and what a dialog needs to ask.
 */
function node(action: Action): ActionNode {
  return {
    type: action.type,
    name: action.state.name ?? action.type,
    trigger: action.trigger,
    ...(action.state.label === undefined ? {} : { label: action.state.label }),
    ...(action.state.confirmation === undefined
      ? {}
      : { confirmation: action.state.confirmation }),
    ...(action.state.danger === true ? { danger: true as const } : {}),
  };
}

/** The paths a client may sort by: exactly those a column declared. */
/**
 * Every path the columns read, dotted ones included.
 *
 * This is the declaration the loading plan is built from: a column saying
 * `author.name` is a column saying the query has to reach the author. One plan
 * per request, merged across every column, which is what keeps the count at one
 * query rather than one per row.
 */
export function columnPaths(table: Table): readonly string[] {
  return table.state.columns.map((column) => column.state.path);
}

export function sortablePaths(table: Table): ReadonlySet<string> {
  return new Set(
    table.state.columns.filter((c) => c.state.sortable).map((c) => c.state.path),
  );
}

/**
 * The filters a table declared, by the name a client asks for them by.
 *
 * Two filters under one name would leave one of them unreachable, and which one
 * would depend on the order they were written in. That is a mistake to make
 * loudly and at boot, in the way a table is built once and read on every
 * request — not a refusal to make per request, where it would tell a caller
 * something about a table they never asked about.
 */
/**
 * The actions a request may name, and the only ones.
 *
 * The oracle every other reachable surface here is built on: an allowlist read
 * off the declaration, so a name nobody declared reaches nothing. Row and
 * header actions share one namespace because a request names an action, not a
 * place it was drawn.
 */
export function declaredActions(table: Table): ReadonlyMap<string, Action> {
  const byName = new Map<string, Action>();

  for (const action of [...table.state.actions, ...table.state.headerActions]) {
    const name = action.state.name ?? action.type;
    if (byName.has(name)) {
      throw new Error(
        `two actions are named ${name}; one of them can never be reached. ` +
          `Give one a different \`.name()\`.`,
      );
    }
    byName.set(name, action);
  }
  return byName;
}

export function declaredFilters(table: Table): ReadonlyMap<string, Filter> {
  const byName = new Map<string, Filter>();

  for (const filter of table.state.filters) {
    if (byName.has(filter.state.name)) {
      throw new Error(
        `two filters are named ${filter.state.name}; one of them can never be ` +
          `reached. Give it a different name, or \`.path()\` if both were meant ` +
          `to filter the same column.`,
      );
    }
    byName.set(filter.state.name, filter);
  }
  return byName;
}

/** The paths a search may reach: exactly those a column declared. */
export function searchablePaths(table: Table): ReadonlySet<string> {
  return new Set(
    table.state.columns.filter((c) => c.state.searchable).map((c) => c.state.path),
  );
}
