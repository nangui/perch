/**
 * The table a resource declares.
 *
 * The columns, which of them may be sorted by or searched, the filters a
 * reader can narrow it with, and the actions a row offers. Bulk actions,
 * pagination sizes and the empty state are not here; each needs a route or a
 * renderer that does not exist yet, and an option that does nothing is worse
 * than an absent one.
 */
import type { Action, ActsOn, Confirmation, ModalWidth } from "./action.js";
import { actsOn, ActionGroup, everyAction } from "./action.js";
import type { Column, PresentContext } from "./column.js";
import type { Option } from "./option.js";
import type { Filter } from "./filter.js";
import { SelectFilter, TernaryFilter, TrashedFilter } from "./filter.js";
import type { Row, SortDirection } from "./data-adapter.js";
import type { SchemaNode } from "./serialise.js";

export interface TableState {
  readonly columns: readonly Column[];
  readonly filters: readonly Filter[];
  readonly actions: readonly (Action | ActionGroup)[];
  readonly headerActions: readonly (Action | ActionGroup)[];
  /** What a ticked selection may be put through. */
  readonly bulkActions: readonly (Action | ActionGroup)[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
  readonly empty?: EmptyState;
}

/**
 * What a table says when it has nothing to show.
 *
 * Static, all of it: an empty page has no record to work a sentence out from,
 * which is the whole reason there is nothing on it.
 */
export interface EmptyState {
  readonly heading?: string;
  readonly description?: string;
  readonly icon?: string;
}

/** What crosses the wire, as a `ColumnTree`. */
export interface ColumnNode {
  /** Keys the renderer registry. */
  readonly type: string;
  readonly path: string;
  readonly label?: string;
  readonly sortable?: true;
  /**
   * The reader may take this column off, and whether it starts off.
   *
   * Sent because the client draws the control from it. What is on and what is
   * off after that is the browser's — the server has no opinion about which
   * columns one reader keeps, and a column left out of a page is still a column
   * whose values were read.
   */
  readonly toggleable?: true;
  readonly hiddenByDefault?: true;
  readonly boolean?: true;
  readonly circular?: true;
  readonly stacked?: true;
  readonly size?: number;
  readonly limit?: number;
  readonly copyable?: true;
  /**
   * The other two paths a column that draws a face beside a name reads.
   *
   * Sent so a cell can find them in the row it was handed: a renderer is given
   * the whole projected row, and these say which of its values are the face and
   * the line under the name.
   */
  readonly image?: string;
  readonly description?: string;
  /**
   * The ends of the scale a gauge draws against.
   *
   * Sent because the length is worked out where the bar is drawn: that is not a
   * rule and not state, it is arithmetic on a value the server already settled.
   */
  readonly min?: number;
  readonly max?: number;
  /**
   * This reader may write this cell.
   *
   * Not part of what a table declares — a column is writable or it is not, and
   * that is the same for everybody. This says whether the one asking may, which
   * is the server's answer to the reader in front of it, and a cell without it
   * draws what it holds and no control.
   */
  readonly editable?: true;
  /**
   * What the field at this path says about itself, for a cell that draws a
   * control over it: which kind of box, and how much it takes.
   *
   * Copied from the form rather than declared on the column, because the form
   * owns the rules and a column that repeated them would be a second place to
   * change and a second place to forget.
   */
  readonly flavour?: string;
  readonly maxLength?: number;
  /** The choices a cell offers, which are the field's and never the column's. */
  readonly options?: readonly Option[];
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
  /**
   * The form a filter carries, already resolved.
   *
   * Sent as a tree because that is what it is: the same nodes a form is drawn
   * from, so the same renderers draw them and a `Select` inside a filter gets
   * its options the way any other one does. Absent for a filter that is a
   * column and a comparison, which needs no tree to say so.
   */
  readonly schema?: SchemaNode;
  /** What its fields hold, as the server settled them. */
  readonly state?: Readonly<Record<string, unknown>>;
}

/** What a row action looks like on the wire. */
export interface ActionNode {
  readonly type: string;
  /** What a request calls it. The client sends this back, not the type. */
  readonly name: string;
  /**
   * A link the browser follows, a request it makes, or something to read.
   *
   * `show` changes nothing: the client asks for content and draws it, and the
   * way out is the way out of any dialog.
   */
  readonly trigger: "link" | "run" | "show" | "group";
  /** For a link: which of the row's pages. The address is the client's to build. */
  readonly page?: "edit" | "view";
  /** It collects something first. The schema is asked for, never sent here. */
  readonly hasForm?: true;
  readonly label?: string;
  /** Present when the reader is asked first. Its absence means it is not. */
  readonly confirmation?: Confirmation;
  readonly danger?: true;
  /**
   * Which rows it means anything on: `live`, `marked`, or either.
   *
   * Sent because the client cannot work it out. Knowing that a restore has
   * nothing to do to a row that was never hidden means knowing what a restore
   * is, and that is the knowledge this tree exists to keep on the server.
   */
  readonly actsOn?: ActsOn;
  /**
   * What a group holds, where this node is one.
   *
   * The one place the grouping survives. Everywhere else — the allowlist, the
   * policy each is held to, what the boot asks — a group is opened out, because
   * all of those are about the actions and a group that changed any of them
   * would be a place to hide one.
   */
  readonly children?: readonly ActionNode[];
  /** A glyph beside a group's label. Decoration; the label carries it. */
  readonly icon?: string;
  /** How wide its modal opens, and whether it opens against the side. */
  readonly modalWidth?: ModalWidth;
  readonly slideOver?: true;
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
  /** What it offers for a ticked selection. */
  readonly bulkActions: readonly ActionNode[];
  readonly defaultSort?: { readonly path: string; readonly direction: SortDirection };
  readonly empty?: EmptyState;
}

export class Table {
  readonly state: TableState;

  private constructor(state: TableState) {
    this.state = state;
  }

  static make(): Table {
    return new Table({
      columns: [],
      filters: [],
      actions: [],
      headerActions: [],
      bulkActions: [],
    });
  }

  /** What a reader can narrow the table with. */
  filters(list: readonly Filter[]): Table {
    return new Table({ ...this.state, filters: [...list] });
  }

  columns(list: readonly Column[]): Table {
    return new Table({ ...this.state, columns: [...list] });
  }

  /** What a row offers. Rendered after the last column. */
  actions(list: readonly (Action | ActionGroup)[]): Table {
    return new Table({ ...this.state, actions: [...list] });
  }

  /** What the table offers as a whole — creating a row, above all. */
  headerActions(list: readonly (Action | ActionGroup)[]): Table {
    return new Table({ ...this.state, headerActions: [...list] });
  }

  /**
   * What a ticked selection may be put through.
   *
   * The same action a row offers can be listed here — the same instance, not a
   * second one built the same way. One action, one name, wherever it is drawn.
   */
  bulkActions(list: readonly (Action | ActionGroup)[]): Table {
    return new Table({ ...this.state, bulkActions: [...list] });
  }

  /**
   * Where the table opens. Not checked against the columns here: a sort the
   * client asks for is refused at the boundary, and one the resource declares
   * is the resource's own business.
   */
  defaultSort(path: string, direction: SortDirection = "asc"): Table {
    return new Table({ ...this.state, defaultSort: { path, direction } });
  }

  /**
   * What to say when there is nothing to show.
   *
   * Without one the table says so in the plainest words it has. With one it can
   * say why there is nothing yet and what to do about it — which is the
   * difference between an empty page and a page that looks broken.
   */
  emptyState(state: EmptyState): Table {
    return new Table({ ...this.state, empty: state });
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
/**
 * Every row, as the columns that draw it say it should leave the server.
 *
 * Almost every column hands its value straight through — a table shows what a
 * row holds. The ones that do not are the ones whose value is an instruction to
 * a browser: an address bound for an attribute is judged here, where the rule
 * about addresses lives, rather than in a package that may not import this one.
 *
 * Through a relation as readily as beside one. A row carries the whole related
 * object, so `author.avatar` is a value that reaches a browser like any other,
 * and a column that only judged the paths without a dot in them would be a rule
 * with a way around it written on the label.
 */
export function presentRows(
  rows: readonly Row[],
  table: Table | undefined,
  context: PresentContext = {},
): readonly Row[] {
  const shown = table?.state.columns ?? [];
  if (shown.length === 0) return rows;

  return rows.map((row) => {
    let out: Row = row;
    for (const column of shown) {
      // Each path the column reads, not only the one it is named by: a column
      // drawing a face beside a name judges the face at the face's own path.
      for (const path of column.paths) {
        out = presentAt(out, path.split("."), (value) =>
          column.present(value, context, path),
        ) as Row;
      }
    }
    return out;
  });
}

/**
 * One value inside a row, replaced, with everything above it copied.
 *
 * Copied rather than written into, because the row belongs to whoever handed it
 * over: an adapter that caches its rows would find them edited by the act of
 * being listed. A segment that is not there is left alone — a column may name a
 * path this row has nothing at.
 */
function presentAt(
  held: unknown,
  segments: readonly string[],
  present: (value: unknown) => unknown,
): unknown {
  const [head, ...rest] = segments;
  if (head === undefined) return present(held);
  if (held === null || held === undefined) return held;

  // A to-many relation arrives as a list of rows, and the column names one
  // value in each of them.
  if (Array.isArray(held)) {
    return held.map((one) => presentAt(one, segments, present));
  }
  if (typeof held !== "object") return held;

  const row = held as Record<string, unknown>;
  if (!(head in row)) return held;
  return { ...row, [head]: presentAt(row[head], rest, present) };
}

export function serialiseTable(table: Table): ColumnTree {
  return {
    columns: table.state.columns.map((column) => ({
      type: column.type,
      path: column.state.path,
      ...(column.state.label === undefined ? {} : { label: column.state.label }),
      ...(column.state.sortable ? { sortable: true as const } : {}),
      ...(column.state.toggleable === undefined
        ? {}
        : {
            toggleable: true as const,
            ...(column.state.toggleable.hiddenByDefault
              ? { hiddenByDefault: true as const }
              : {}),
          }),
      ...(column.state.boolean === undefined ? {} : { boolean: true as const }),
      ...(column.state.circular === undefined ? {} : { circular: true as const }),
      ...(column.state.stacked === undefined ? {} : { stacked: true as const }),
      ...(column.state.size === undefined ? {} : { size: column.state.size }),
      ...(column.state.limit === undefined ? {} : { limit: column.state.limit }),
      ...(column.state.copyable === undefined ? {} : { copyable: true as const }),
      // Where the other two values are, so a cell can reach them in the row it
      // was handed. The paths, not the values — the row already carries those.
      ...(column.state.image === undefined ? {} : { image: column.state.image }),
      ...(column.state.description === undefined
        ? {}
        : { description: column.state.description }),
      ...(column.state.min === undefined ? {} : { min: column.state.min }),
      ...(column.state.max === undefined ? {} : { max: column.state.max }),
    })),
    ...(searchablePaths(table).size === 0 ? {} : { searchable: true as const }),
    filters: table.state.filters.map((filter) => ({
      type: filter.type,
      name: filter.state.name,
      ...(filter.state.label === undefined ? {} : { label: filter.state.label }),
      // Stringified: a value crosses the wire as what a control will send back,
      // and the declaration turns it into what the column holds on the way in.
      ...(filter instanceof SelectFilter ||
      filter instanceof TrashedFilter ||
      filter instanceof TernaryFilter
        ? {
            options: filter.choices.map((option) => ({
              value: String(option.value),
              label: option.label,
            })),
          }
        : {}),
    })),
    actions: table.state.actions.map(drawn),
    headerActions: table.state.headerActions.map(drawn),
    bulkActions: table.state.bulkActions.map(drawn),
    ...(table.state.empty === undefined ? {} : { empty: table.state.empty }),
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
/**
 * One entry in a list, which is an action or a group of them.
 *
 * A group carries no trigger of its own: pressing it opens what it holds, and
 * there is nothing behind it to run. Said as `group` rather than left out, so a
 * client meeting one knows it is not an action it failed to understand.
 */
function drawn(one: Action | ActionGroup): ActionNode {
  if (!(one instanceof ActionGroup)) return node(one);

  return {
    type: "ActionGroup",
    name: one.state.label,
    trigger: "group",
    label: one.state.label,
    ...(one.state.icon === undefined ? {} : { icon: one.state.icon }),
    children: one.state.actions.map(node),
  };
}

function node(action: Action): ActionNode {
  return {
    type: action.type,
    name: action.state.name ?? action.type,
    trigger: action.trigger,
    ...(action.page === undefined ? {} : { page: action.page }),
    // Said, not sent: a schema has to be resolved against a principal before it
    // means anything, and a table is serialised once for every reader.
    ...(action.state.form === undefined ? {} : { hasForm: true as const }),
    ...(action.state.label === undefined ? {} : { label: action.state.label }),
    ...(action.state.confirmation === undefined
      ? {}
      : { confirmation: action.state.confirmation }),
    ...(action.state.danger === true ? { danger: true as const } : {}),
    // Omitted where it is "either", which is what the client does with an
    // action it is told nothing about. Sending the default would put a word on
    // every action in every tree to say what silence already says.
    ...(actsOn(action) === "either" ? {} : { actsOn: actsOn(action) }),
    ...(action.state.modalWidth === undefined
      ? {}
      : { modalWidth: action.state.modalWidth }),
    ...(action.state.slideOver === true ? { slideOver: true as const } : {}),
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
  return table.state.columns.flatMap((column) => column.paths);
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

  const declared = everyAction([
    ...table.state.actions,
    ...table.state.headerActions,
    ...table.state.bulkActions,
  ]);
  for (const action of declared) {
    const name = action.state.name ?? action.type;
    const already = byName.get(name);
    // The same instance in two lists is one action offered in two places, which
    // is the point: a row and a selection put it through the same code. Two
    // instances under one name is the ambiguity this refuses.
    if (already !== undefined && already !== action) {
      throw new Error(
        `two actions are named ${name}; one of them can never be reached. ` +
          `Give one a different \`.name()\`, or declare the same one in both ` +
          `lists.`,
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
