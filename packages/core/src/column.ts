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
import { safeHref } from "./entries/text-entry.js";

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
  /** An image drawn as a circle, which is what a table of faces wants. */
  readonly circular?: true;
  /** Several images overlapping, rather than in a row of their own width. */
  readonly stacked?: true;
  /** The side of one image, in pixels. */
  readonly size?: number;
  /** How many of several to draw. The rest are counted, not drawn. */
  readonly limit?: number;
  /** A control beside the value that puts it on the clipboard. */
  readonly copyable?: true;
  /**
   * Where the keys in this column live, for a column of uploads.
   *
   * Absent means the column holds addresses already. A key is not an address —
   * where it resolves is the disk's business — so a column of uploaded files
   * says which disk, and the host answers.
   */
  readonly disk?: string;
}

/**
 * What a column may need from the host to present a value.
 *
 * The same question the resolution cycle asks for a form's uploads, asked in
 * the one other place a stored key has to become something a browser fetches.
 */
export interface PresentContext {
  readonly fileUrl?: (disk: string, key: string) => string | undefined;
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

  /**
   * The value as the client should receive it, or nothing.
   *
   * Identity for almost every column, because a table shows what a row holds.
   * It is here for the ones whose value is an instruction to a browser rather
   * than something to read — an address that will end up in an attribute is
   * judged on the server, where the rule about addresses already lives.
   */
  present(value: unknown, context: PresentContext): unknown {
    void context;
    return value;
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

/**
 * `ImageColumn` — one address, or several, drawn rather than read.
 *
 * What it holds is a URL, and a URL from a row is a URL from anywhere: the same
 * reading an image in a schema gets. Judged here rather than in the browser,
 * both because that is where the rule lives and because the alternative is the
 * check written a second time in a package that may not import this one.
 */
export class ImageColumn extends Column {
  static make(path: string): ImageColumn {
    return new ImageColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "ImageColumn";
  }

  /** A circle rather than a square. What a column of faces wants. */
  circular(): this {
    return this.with({ ...this.state, circular: true });
  }

  /** Several of them overlapping, which is how a row shows a group. */
  stacked(): this {
    return this.with({ ...this.state, stacked: true });
  }

  size(pixels: number): this {
    return this.with({ ...this.state, size: pixels });
  }

  /** At most this many. The rest are counted rather than drawn. */
  limit(count: number): this {
    return this.with({ ...this.state, limit: count });
  }

  /**
   * The disk the keys in this column were written to.
   *
   * A column over a file upload holds keys, and a key is not an address: it
   * becomes one through the disk that keeps it, which is the host's to answer
   * for. Without this, a column of uploaded faces draws nothing at all — the
   * key is not an address a browser may fetch, and it is dropped as one.
   */
  disk(name: string): this {
    return this.with({ ...this.state, disk: name });
  }

  /**
   * The addresses a browser may fetch, and nothing else.
   *
   * An address that does not pass is dropped rather than sent and hidden: what
   * the client never receives cannot be put in an attribute by mistake, which
   * is the rule the row projection is built on.
   */
  override present(value: unknown, context: PresentContext): unknown {
    const disk = this.state.disk;
    const address = (one: unknown): string | undefined => {
      if (disk === undefined) return safeHref(one);
      if (typeof one !== "string" || one === "") return undefined;
      // Through the host and then through the same reading: what a disk hands
      // back is an address like any other, and a signed URL from a bucket is
      // exactly the kind of value nobody should put in an attribute unread.
      return safeHref(context.fileUrl?.(disk, one));
    };

    if (Array.isArray(value)) {
      return value.map(address).filter((one) => one !== undefined);
    }
    return address(value);
  }

  protected override with(state: ColumnState): this {
    return new ImageColumn(state) as this;
  }
}

/**
 * `ColorColumn` — a swatch, and the value that made it.
 *
 * Whatever notation the column keeps: a colour picker writes `hex`, `rgb()` or
 * `hsl()` depending on what it was told, and a column somebody else filled
 * holds whatever it holds. What is not a colour is shown as the text it is,
 * because a swatch of nothing says the row is empty when it is not.
 */
export class ColorColumn extends Column {
  static make(path: string): ColorColumn {
    return new ColorColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "ColorColumn";
  }

  /** A control beside the swatch that puts the value on the clipboard. */
  copyable(): this {
    return this.with({ ...this.state, copyable: true });
  }

  protected override with(state: ColumnState): this {
    return new ColorColumn(state) as this;
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
