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
import { isResolver } from "./component.js";
import { safeHref } from "./entries/text-entry.js";
import type { Field } from "./field.js";
import { normaliseOptions } from "./option.js";

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
  /**
   * Whether the reader may take this column off the table, and whether it
   * starts off.
   *
   * A wide table is a table somebody narrows: eight columns are useful to the
   * person auditing and in the way of the person looking up a name. Absent, the
   * column is always there — which is the right default, because a column
   * nobody declared as optional is one the author meant.
   */
  readonly toggleable?: { readonly hiddenByDefault: boolean };
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
   * Lets the reader take this column off, and says whether it starts off.
   *
   * `hiddenByDefault` is for the column that is worth having and not worth the
   * width: a created-at beside six others. It starts off and the reader turns
   * it on, rather than starting on and being turned off by everyone.
   */
  toggleable(hiddenByDefault = false): this {
    return this.with({ ...this.state, toggleable: { hiddenByDefault } });
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

/**
 * A column a reader may write from the table.
 *
 * The write is a form save of one field, so what this class carries is not a
 * rule of its own but the fact that the column offers one at all. Every rule
 * the value has to keep is the form's, and it is asked there: a table that
 * validated a value its own way would be a second boundary, and two boundaries
 * over one row is one of them being out of date.
 */
export abstract class WritableColumn extends Column {
  /** What a cell of this kind may be set to, before the form is asked. */
  abstract admits(value: unknown): boolean;

  /**
   * Whether the form's field at this path can carry what this column writes.
   *
   * Asked of the field rather than decided from a list of classes, for the
   * reason `Field.admits` gives about itself: a chain of `instanceof` is a
   * chain every new field type has to be added to, and nothing would remind
   * anybody. Two questions, because one is not enough — `Field.admits` takes
   * any scalar unless a field narrows it, so a text input answers yes to
   * `true` and the boolean would reach the column.
   */
  abstract fits(field: Field): boolean;
}

/**
 * Both halves of the boolean question, asked once.
 *
 * A field that holds two values takes one of them and turns text away. One
 * question would not do it: `Field.admits` takes any scalar unless a field
 * narrows it, so a text input says yes to `true`.
 */
function holdsBooleans(field: Field): boolean {
  return (
    field.admits(true, undefined) === undefined &&
    field.admits("perch", undefined) !== undefined
  );
}

/**
 * The other side of the same coin: a field that narrows nothing.
 *
 * Free text is what a field holds when it has declined to say what it holds, so
 * the question is not "does it take a string" — a stored file key is a string
 * and a colour is a string — but "does it take a string *and* anything else".
 * The fields that say yes to both are the ones with no shape of their own.
 */
function holdsAnyText(field: Field): boolean {
  return (
    field.admits("perch", undefined) === undefined &&
    field.admits(true, undefined) === undefined
  );
}

/**
 * `ToggleColumn` — a switch in a cell.
 *
 * The same value an `IconColumn` draws and the opposite intent: one says what a
 * row is, the other changes it. A table of flags nobody may change wants the
 * icon, and a reader who may is spared the round trip through an edit page.
 */
export class ToggleColumn extends WritableColumn {
  static make(path: string): ToggleColumn {
    return new ToggleColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "ToggleColumn";
  }

  /** A switch holds one of two things and there is no third. */
  override admits(value: unknown): boolean {
    return typeof value === "boolean";
  }

  override fits(field: Field): boolean {
    return holdsBooleans(field);
  }

  protected override with(state: ColumnState): this {
    return new ToggleColumn(state) as this;
  }
}

/** `CheckboxColumn` — the same as a toggle, drawn as a box. */
export class CheckboxColumn extends WritableColumn {
  static make(path: string): CheckboxColumn {
    return new CheckboxColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "CheckboxColumn";
  }

  override admits(value: unknown): boolean {
    return typeof value === "boolean";
  }

  override fits(field: Field): boolean {
    return holdsBooleans(field);
  }

  protected override with(state: ColumnState): this {
    return new CheckboxColumn(state) as this;
  }
}

/**
 * `TextInputColumn` — a line of text, edited where it is read.
 *
 * For the column somebody retypes twenty times in an afternoon: a title, a
 * reference, a note. Anything with a shape — a date, a colour, a choice — has a
 * field that knows its shape, and a cell that let text into one of those would
 * be writing past the only thing that understands it.
 */
export class TextInputColumn extends WritableColumn {
  static make(path: string): TextInputColumn {
    return new TextInputColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "TextInputColumn";
  }

  /**
   * Text, and the empty string with it: clearing a cell is a thing a reader
   * does, and the field decides whether nothing is allowed there.
   */
  override admits(value: unknown): boolean {
    return typeof value === "string";
  }

  override fits(field: Field): boolean {
    return holdsAnyText(field);
  }

  protected override with(state: ColumnState): this {
    return new TextInputColumn(state) as this;
  }
}

/**
 * `SelectColumn` — one of a few, chosen where it is read.
 *
 * The choices are the form field's, never the column's. A column that declared
 * its own list would be a second list to keep in step with the first, and the
 * one that drifted would be the one nobody looked at — the boundary matches
 * against the field's, so a cell offering anything else offers a value that
 * cannot be saved.
 *
 * Which is also why it fits only a field whose list is written down. A list
 * that comes from a resolver is a different list per row, and a list that comes
 * from a relationship is a query per row: both are a page of dropdowns nobody
 * asked for. A select in a cell is for the handful of fixed choices — a status,
 * a role — and the boot says so for the rest.
 */
export class SelectColumn extends WritableColumn {
  static make(path: string): SelectColumn {
    return new SelectColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "SelectColumn";
  }

  /**
   * One value, or none, and the field says which ones.
   *
   * Nothing about membership here: the field holds the list, resolves it per
   * request, and refuses what is not in it. Asking the same question twice is
   * how the two answers come to differ.
   *
   * Nothing is a value a reader can choose — a cell that could take a value and
   * never give it back is a one-way door — and whether the field allows it is
   * the field's own answer, given by `required` like everywhere else.
   */
  override admits(value: unknown): boolean {
    return value === null || typeof value === "string" || typeof value === "number";
  }

  override fits(field: Field): boolean {
    const declared = field.declaredOptions;
    // Nothing declared, or declared as a function: neither is a list this
    // column can put in a cell.
    if (declared === undefined || isResolver(declared)) return false;

    const options = normaliseOptions(declared);
    // A field that holds several is not a field one cell chooses for, and one
    // that turns away its own first choice is not offering a list at all.
    return options.length > 0 && field.admits(options[0]?.value, options) === undefined;
  }

  protected override with(state: ColumnState): this {
    return new SelectColumn(state) as this;
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
