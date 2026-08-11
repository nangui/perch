/**
 * Table columns.
 *
 * A column is not a `Component`. A component carries state and is resolved per
 * request; a column describes a *slot* and is resolved per row. A React
 * component per cell is forbidden: one memoised render function per column
 * type. Sharing a base class with `Field` would have invited the opposite.
 *
 * `type` is declared rather than read from `constructor.name`, for the reason
 * `Component` gives: a minifier rewrites the second, and a plugin cannot choose
 * it.
 */

export interface ColumnState {
  /** The path into the row: `title`, or `author.name`. */
  readonly path: string;
  /**
   * Static, not a resolver. A column header is written once for the table, not
   * once per row — resolving it per row would be the label equivalent of N+1.
   */
  readonly label?: string;
  readonly sortable: boolean;
  readonly searchable: boolean;
  /** Renders a check or a cross rather than the value. */
  readonly boolean?: true;
}

export abstract class Column {
  readonly state: ColumnState;

  /** Keys the renderer registry, and survives minification. */
  abstract get type(): string;

  constructor(state: ColumnState) {
    this.state = state;
  }

  /** Every fluent method clones: a builder shared between requests leaks. */
  protected abstract with(state: ColumnState): this;

  label(text: string): this {
    return this.with({ ...this.state, label: text });
  }

  /**
   * Lets the client sort by this column, and — the part that matters — lets the
   * server accept it. Ordering by a column reveals the order of its values, so
   * an undeclared column is refused rather than sorted by.
   */
  sortable(on = true): this {
    return this.with({ ...this.state, sortable: on });
  }

  /**
   * Lets a search term reach this column, and — the part that matters — lets
   * the server accept it reaching it. A search is an oracle in the way a sort
   * is: asking whether any row matches `@acme.com` answers a question about
   * values nobody displayed. So an undeclared column is not searched, and
   * declaring one is a decision rather than a default.
   */
  searchable(on = true): this {
    return this.with({ ...this.state, searchable: on });
  }
}

export class TextColumn extends Column {
  static make(path: string): TextColumn {
    return new TextColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "TextColumn";
  }

  protected override with(state: ColumnState): this {
    return new TextColumn(state) as this;
  }
}

export class IconColumn extends Column {
  static make(path: string): IconColumn {
    return new IconColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "IconColumn";
  }

  /** A check or a cross, from a truthy value. */
  boolean(): this {
    return this.with({ ...this.state, boolean: true });
  }

  protected override with(state: ColumnState): this {
    return new IconColumn(state) as this;
  }
}
