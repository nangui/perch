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
import { fileAddress } from "./file-address.js";
import type { EntryTone, ToneChoice } from "./entries/text-entry.js";
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
  /**
   * Which edge the value sits against.
   *
   * Logical, not left and right: a panel read in Arabic or Hebrew puts the
   * start of a line on the other side, and a column pinned to the left there
   * is a column pinned to the wrong end of the row.
   */
  readonly alignment?: "start" | "center" | "end";
  /** How wide the column asks to be, as a CSS length. */
  readonly width?: string;
  /** Left out where the window is too narrow for a row to be a row. */
  readonly hiddenWhenNarrow?: true;
  /**
   * Whether this reader gets the column at all.
   *
   * Given the reader and not a record. A column heading is decided once for
   * the table, the way its label is: asking per row would be the heading
   * equivalent of N+1, and a column that came and went down a page is not a
   * column anybody can read.
   */
  readonly visible?: (user: unknown) => boolean | Promise<boolean>;
  /**
   * How the value reads, where reading it is not the same as showing it.
   *
   * The rule only. What it turns into is the browser's answer, because the
   * locale is the reader's and one response is read by several: a date sent
   * with the zone it belongs to shows as a French date to one reader and an
   * American one to another, and formatting it here would pick for both.
   */
  readonly format?: "dateTime" | "money" | "numeric";
  /** Which wall clock a timestamp is read against. */
  readonly timezone?: string;
  /** The currency an amount is in, which no row carries. */
  readonly currency?: string;
  /** How many decimal places a number keeps. */
  readonly decimals?: number;
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
  /**
   * Which tone a value in this column carries.
   *
   * `ToneChoice`, so a fixed one or one read from the value — and read on the
   * server, because the map from a value to a meaning is a rule somebody wrote
   * and the browser has no way to know it. Never on the wire: a function does
   * not cross it, and `serialiseTable` copies no key it was not asked for.
   */
  readonly color?: ToneChoice;
  /** Where the face beside a name lives, for a column that draws both. */
  readonly image?: string;
  /** The quieter second line under it: an address, a handle, a team. */
  readonly description?: string;
  /**
   * The ends of the scale a value is drawn against.
   *
   * Both, because a proportion needs them: 4 means nothing until something says
   * out of what, and a gauge with only one end is a bar whose length is a
   * guess. Declared rather than read from the data — a scale that moved with
   * the page's largest value would redraw every row when one changed.
   */
  readonly min?: number;
  readonly max?: number;
}

/**
 * What a badge column hands a cell: the value, and what it was judged to mean.
 *
 * A shape rather than a bare value, because the tone is per row and the column
 * tree is per table — there is nowhere else for it to travel. Always carries a
 * tone, so a cell has one thing to draw rather than two cases.
 */
export interface BadgedValue {
  readonly value: unknown;
  readonly tone: EntryTone;
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
   * Which edge the value sits against: `start`, `center` or `end`.
   *
   * `end` is what a column of numbers wants, so the digits line up and a
   * reader can compare two amounts by their shape rather than by reading
   * them. Logical rather than left and right, because a panel read
   * right to left puts the start of a line on the other side.
   */
  alignment(edge: "start" | "center" | "end"): this {
    return this.with({ ...this.state, alignment: edge });
  }

  /**
   * How wide to ask to be, as a CSS length.
   *
   * A request rather than an instruction: a table divides what it has, and a
   * column asking for more than there is gets what is left. Anything that is
   * not a length is dropped rather than written into the page, since a value
   * that cannot be meant is a value somebody mistyped.
   */
  width(length: string): this {
    return /^\d+(\.\d+)?(px|rem|em|ch|%)$/.test(length.trim())
      ? this.with({ ...this.state, width: length.trim() })
      : this;
  }

  /**
   * Leaves the column out where the window is too narrow for a row to be a row.
   *
   * There, a row is a stack and every column is a line of its own, so eight of
   * them is eight lines to scroll past for the two somebody came for. This is
   * how a column says it is not one of the two.
   *
   * A layout decision and not a permission: the value is still read, still
   * sent and still there for a wider window. `visible()` is the one that keeps
   * a value from a reader.
   */
  hideWhenNarrow(): this {
    return this.with({ ...this.state, hiddenWhenNarrow: true });
  }

  /**
   * Keeps the column from a reader who may not have it.
   *
   * Not the same as `toggleable`, and the difference is the whole point. A
   * column taken off is a column whose values were still read, sent and sitting
   * in the page; one refused here is not in the table at all, so its values are
   * not projected, not presented and not sent. A salary column hidden by
   * styling is a salary column in the response.
   *
   * Asked once per request, with the reader. Absent means always there, which
   * is the right default: a column nobody guarded is one the author meant.
   */
  visible(when: (user: unknown) => boolean | Promise<boolean>): this {
    return this.with({ ...this.state, visible: when });
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
  present(value: unknown, context: PresentContext, path: string): unknown {
    void context;
    void path;
    return value;
  }

  /**
   * Every path this column reads.
   *
   * One for almost all of them, and `state.path` is the one it is sorted,
   * searched and written by. A column drawing a face beside a name reads three,
   * and they have to be here rather than only in the renderer: this list is
   * what the loading plan is built from and what the row projection keeps, so a
   * path missing from it is a value that never reaches the browser.
   */
  get paths(): readonly string[] {
    return [this.state.path];
  }
}

export class TextColumn extends Column {
  static make(path: string): TextColumn {
    return new TextColumn({ path, sortable: false, searchable: false });
  }

  /**
   * A date and a time, read in `timezone` and the reader's own where none is
   * named.
   *
   * The same three a text entry declares, and the same formatter applies them,
   * because it is one question: a panel where a date reads one way on a record
   * and another in the list of them is a panel nobody trusts about either.
   */
  dateTime(options: { readonly timezone?: string } = {}): this {
    return this.with({
      ...this.state,
      format: "dateTime",
      ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
    });
  }

  /** A number, grouped the way the reader's locale groups numbers. */
  numeric(options: { readonly decimals?: number } = {}): this {
    return this.with({
      ...this.state,
      format: "numeric",
      ...(options.decimals === undefined ? {} : { decimals: options.decimals }),
    });
  }

  /** An amount, in a currency the row does not carry and the column declares. */
  money(currency: string): this {
    return this.with({ ...this.state, format: "money", currency });
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
  override present(value: unknown, context: PresentContext, path: string): unknown {
    void path;
    const one = (held: unknown): string | undefined =>
      address(held, this.state.disk, context);

    if (Array.isArray(value)) {
      return value.map(one).filter((held) => held !== undefined);
    }
    return one(value);
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

/**
 * `BadgeColumn` — a value drawn as a state rather than read as a word.
 *
 * The column a status belongs in. Left as text, "active" and "suspended" are
 * two words a reader has to read; as badges they are two colours they can count
 * down a column without reading at all, which is what a table of two hundred
 * rows is for.
 *
 * A tone, not a colour: which green the panel uses is the theme's business, and
 * a column naming a hex would be the one thing on the page a theme could not
 * change. The same four names an entry uses, so a status has one meaning either
 * side of the panel.
 */
export class BadgeColumn extends Column {
  static make(path: string): BadgeColumn {
    return new BadgeColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "BadgeColumn";
  }

  /**
   * What this value means, as a name.
   *
   * Given the value rather than a context: the thing a status depends on is the
   * status, and asking for `({ record }) => record?.status` would be asking an
   * author to write the path they already declared. Synchronous, because this
   * is a lookup table — a colour worth a query on is a column the record should
   * be carrying.
   */
  color(tone: ToneChoice): this {
    return this.with({ ...this.state, color: tone });
  }

  /**
   * The tone settled for this row, on the server.
   *
   * `neutral` where nothing was declared or the choice returned nothing, so a
   * cell always has a badge to draw rather than a badge and an exception.
   */
  override present(value: unknown, context: PresentContext, path: string): BadgedValue {
    void context;
    void path;
    const declared = this.state.color;
    const tone = typeof declared === "function" ? declared(value) : declared;
    return { value, tone: tone ?? "neutral" };
  }

  protected override with(state: ColumnState): this {
    return new BadgeColumn(state) as this;
  }
}

/**
 * One stored value read as an address a browser may fetch, or nothing.
 *
 * Shared by the two columns that draw a picture, because the reading is the
 * same and a second copy of it is a second place to forget the disk.
 */
function address(
  value: unknown,
  disk: string | undefined,
  context: PresentContext,
): string | undefined {
  // Shared with the infolist's picture entry, which asks the same question of
  // the same host. Two answers would be one answer and one drift.
  return fileAddress(value, disk, context.fileUrl);
}

/**
 * `AvatarColumn` — a face, a name, and the line under it, in one column.
 *
 * Three columns is what a table of people looks like when nobody decided: a
 * narrow one holding a picture, one holding a first name, one holding an
 * address, each with its own heading and its own width. They are one thing — a
 * person — and a reader scans them as one, so they are drawn as one.
 *
 * Sorted and searched by the name, because that is the value the column is
 * about; the face and the second line come along. The face is judged the way
 * `ImageColumn` judges one, at its own path, since an address bound for an
 * attribute is the server's business wherever it was declared.
 */
export class AvatarColumn extends Column {
  static make(path: string): AvatarColumn {
    // Round by default, because the picture beside a name is a face and a face
    // in a square is a passport photograph.
    return new AvatarColumn({
      path,
      sortable: false,
      searchable: false,
      circular: true,
    });
  }

  override get type(): string {
    return "AvatarColumn";
  }

  /** Where the face is. Without one the column is a name and a second line. */
  image(path: string): this {
    return this.with({ ...this.state, image: path });
  }

  /** The quieter line under the name: an address, a handle, a team. */
  description(path: string): this {
    return this.with({ ...this.state, description: path });
  }

  /** The disk the keys in the image path were written to. */
  disk(name: string): this {
    return this.with({ ...this.state, disk: name });
  }

  /** A square rather than a circle, for a logo rather than a face. */
  square(): this {
    // The key removed rather than set to nothing: the state says a column is
    // round or says nothing, and `undefined` is not one of the two.
    const rest = { ...this.state };
    delete rest.circular;
    return this.with(rest);
  }

  size(pixels: number): this {
    return this.with({ ...this.state, size: pixels });
  }

  override get paths(): readonly string[] {
    return [this.state.path, this.state.image, this.state.description].filter(
      (path): path is string => path !== undefined,
    );
  }

  /**
   * The face judged as an address, the rest left alone.
   *
   * By path, because this column reads three and only one of them is going into
   * an attribute. The same reading `ImageColumn` gives, for the same reason: the
   * rule about addresses lives here, not in a package that may not import this
   * one.
   */
  override present(value: unknown, context: PresentContext, path: string): unknown {
    if (path !== this.state.image) return value;
    return address(value, this.state.disk, context);
  }

  protected override with(state: ColumnState): this {
    return new AvatarColumn(state) as this;
  }
}

/**
 * `GaugeColumn` — a number read as a length rather than as digits.
 *
 * The column for a proportion: a score, a quota, a completion. Down a page of
 * rows, digits have to be compared one against another and bars do not — a
 * reader sees which is short without reading any of them.
 *
 * The proportion is worked out in the browser, which is not a rule and not
 * state: it is where the value falls between two ends the server declared. What
 * the server keeps is the number.
 */
export class GaugeColumn extends Column {
  static make(path: string): GaugeColumn {
    return new GaugeColumn({ path, sortable: false, searchable: false });
  }

  override get type(): string {
    return "GaugeColumn";
  }

  /**
   * The ends of the scale, low first.
   *
   * Both at once rather than two methods, because a gauge with one end is a bar
   * whose length nobody can defend, and taking them together is what stops one
   * being declared without the other.
   */
  range(low: number, high: number): this {
    return this.with({ ...this.state, min: low, max: high });
  }

  protected override with(state: ColumnState): this {
    return new GaugeColumn(state) as this;
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
