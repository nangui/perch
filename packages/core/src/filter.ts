/**
 * The filters a table declares.
 *
 * A filter is not a clause. A clause is a path, a comparison and a value, and
 * an adapter runs it; a filter is a control a reader operates, and it produces
 * a clause once a value arrives. Keeping them apart is the whole security
 * story: the path and the comparison are settled here, in code nobody outside
 * can reach, and only the value ever comes from a URL.
 *
 * So a client sends `filter.published=true`, never a path and never an
 * operator. A name it did not declare is dropped in silence, like a sort on an
 * undeclared column, and for the same reason: an error would say which filters
 * exist.
 */
import type { Clause, ClauseOperator, DeletedRows } from "./data-adapter.js";
import { isRealDay, toInstant } from "./zoned.js";
import type { Option, OptionsInput } from "./option.js";
import { normaliseOptions } from "./option.js";

export interface FilterState {
  /** What a client names it by. Unique within a table. */
  readonly name: string;
  /** What it filters. The name, unless it was told otherwise. */
  readonly path: string;
  readonly label?: string;
  readonly operator: ClauseOperator;
}

export abstract class Filter {
  readonly state: FilterState;

  /** Keys the renderer registry, and survives minification. */
  abstract get type(): string;

  constructor(state: FilterState) {
    this.state = state;
  }

  /** Every fluent method clones: a builder shared between requests leaks. */
  protected abstract with(state: FilterState): this;

  label(text: string): this {
    return this.with({ ...this.state, label: text });
  }

  /**
   * The column this filters, when it is not the one it is named after — a
   * filter called `author` reaching `author.name`, say.
   */
  path(target: string): this {
    return this.with({ ...this.state, path: target });
  }

  /**
   * The clauses a value produces, which is usually one and sometimes two.
   *
   * The value is the only thing here that came from outside, and it lands in
   * `value` alone. Returning none is how a filter says it was left blank,
   * which is different from saying it matched nothing — a range whose ends
   * cross produces both of its clauses and an empty table, because a reader
   * who asked for an impossible range should see that they did.
   */
  abstract clauses(value: string): readonly Clause[];

  /**
   * The value as it was actually used, which is what a client is told.
   *
   * Almost always the one that arrived. A filter that reads part of a value
   * and drops the rest says so here, or the control draws itself from a half
   * the server never applied — an empty box beside a link that claims
   * otherwise, and no way for a reader to tell which is true.
   */
  applied(value: string): string {
    return value;
  }

  /**
   * Which rows a value asks a list to show, for the one filter that decides it.
   *
   * Deletion is not a column a clause can name. A marked row is left out by the
   * read itself, at the top level and inside every relation, so asking for it
   * back is a different question from narrowing a set — and the only filter
   * that answers it is the one below.
   */
  deleted(value: string): DeletedRows | undefined {
    void value;
    return undefined;
  }
}

/**
 * Yes, no, or either — a column that holds one of two answers.
 *
 * Three states and not a checkbox, because a checkbox has two and the third is
 * the one a filter needs: a tick that means "either" is a tick nobody can read.
 * The empty choice is that third state, so putting the control back asks for
 * the unfiltered page.
 *
 * A closed set, like every other choice here: `filter.published=maybe` is not a
 * way to ask a question nobody declared.
 */
export class TernaryFilter extends Filter {
  static make(name: string): TernaryFilter {
    return new TernaryFilter({ name, path: name, operator: "equals" });
  }

  override get type(): string {
    return "TernaryFilter";
  }

  protected override with(state: FilterState): this {
    return new TernaryFilter(state) as this;
  }

  override clauses(value: string): readonly Clause[] {
    if (value !== "yes" && value !== "no") return [];
    // The boolean, not the word: a column that holds `true` compared against
    // `"yes"` finds nothing and reads as an empty table rather than as a bug.
    return [{ path: this.state.path, operator: "equals", value: value === "yes" }];
  }

  /** Drawn like any other closed set, so the client needs nothing new. */
  get choices(): readonly { readonly value: string; readonly label: string }[] {
    return [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
  }
}

/**
 * With deleted, only deleted, or neither — the filter that lifts the read's own
 * exclusion rather than narrowing what it returned.
 *
 * A closed set of three, so `filter.trashed=<anything>` is not a way to ask a
 * question nobody declared. The empty choice is what a list does by default,
 * which is why it has no value of its own: putting the control back is asking
 * for the ordinary page.
 */
export class TrashedFilter extends Filter {
  static make(name = "trashed"): TrashedFilter {
    return new TrashedFilter({ name, path: name, operator: "equals" });
  }

  override get type(): string {
    return "TrashedFilter";
  }

  protected override with(state: FilterState): this {
    return new TrashedFilter(state) as this;
  }

  /** Never a clause. What it decides is which rows the read returns at all. */
  override clauses(): readonly Clause[] {
    return [];
  }

  override deleted(value: string): DeletedRows | undefined {
    return value === "with" || value === "only" ? value : undefined;
  }

  /** Drawn like any other closed set, so the client needs nothing new. */
  get choices(): readonly { readonly value: string; readonly label: string }[] {
    return [
      { value: "with", label: "With deleted" },
      { value: "only", label: "Only deleted" },
    ];
  }
}

/** A free-text match, `contains` unless told to be exact. */
export class TextFilter extends Filter {
  static make(name: string): TextFilter {
    return new TextFilter({ name, path: name, operator: "contains" });
  }

  override get type(): string {
    return "TextFilter";
  }

  protected override with(state: FilterState): this {
    return new TextFilter(state) as this;
  }

  /** The whole value rather than any part of it. */
  exact(on = true): this {
    return this.with({ ...this.state, operator: on ? "equals" : "contains" });
  }

  override clauses(value: string): readonly Clause[] {
    const term = value.trim();
    if (term === "") return [];

    return [{ path: this.state.path, operator: this.state.operator, value: term }];
  }
}

/**
 * A choice among values the table named.
 *
 * The closed set is the point. A free-text filter passes whatever arrives
 * through to a `contains`; this one answers only to values it declared, so
 * `filter.status=<anything>` is not a way to ask whether a row exists with that
 * value in that column. A value nothing declared produces no clause.
 *
 * The declared value is what reaches the clause, not the string that arrived.
 * A URL carries `1`, the option holds the number `1`, and an Int column
 * compared against the string would find nothing and look like an empty table
 * rather than a bug.
 */
export class SelectFilter extends Filter {
  readonly choices: readonly Option[];

  private constructor(state: FilterState, choices: readonly Option[]) {
    super(state);
    this.choices = choices;
  }

  static make(name: string): SelectFilter {
    return new SelectFilter({ name, path: name, operator: "equals" }, []);
  }

  override get type(): string {
    return "SelectFilter";
  }

  protected override with(state: FilterState): this {
    return new SelectFilter(state, this.choices) as this;
  }

  /** What it may be set to. A static list; a relationship comes later. */
  options(input: OptionsInput): this {
    return new SelectFilter(this.state, normaliseOptions(input)) as this;
  }

  override clauses(value: string): readonly Clause[] {
    // Matched as a string because that is what a URL carries, and answered with
    // the declared value because that is what the column holds.
    const chosen = this.choices.find((option) => String(option.value) === value);
    if (chosen === undefined) return [];

    return [
      {
        path: this.state.path,
        operator: this.state.operator,
        value: chosen.value,
      },
    ];
  }
}

/**
 * Between two dates, either end left open.
 *
 * The whole difficulty is the far end. A reader asking for the 1st to the 30th
 * means the 30th included, and comparing a column of instants against midnight
 * on the 30th drops everything that happened during it — the last day of every
 * range, silently, in a table that otherwise looks right. So the far end is the
 * midnight that *starts the day after*, compared with `lt`, which includes the
 * whole of the day asked for and nothing of the next.
 *
 * Whose midnight is a question with no default worth guessing. A panel is read
 * from several places and written to one database: the browser's zone would put
 * a row in or out of the range depending on who looked, and the server's would
 * move every range on a deployment. So the zone is declared, exactly as the
 * date field declares its own, and the same conversion runs — which is also
 * what makes the two mornings a year with no single midnight come out right.
 *
 * The value crosses as `from..to`, one parameter, so a filtered page is still
 * one link a reader can send someone. Either side may be empty: `2026-01-01..`
 * is everything since, `..2026-06-30` everything until.
 */
export interface DateRangeFilterState extends FilterState {
  /** IANA, and declared: a date with no zone is a date with an opinion. */
  readonly timezone: string;
}

/** `YYYY-MM-DD`, and nothing else. A URL is not a place to parse dates from. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DateRangeFilter extends Filter {
  declare readonly state: DateRangeFilterState;

  private constructor(state: DateRangeFilterState) {
    super(state);
  }

  static make(name: string): DateRangeFilter {
    return new DateRangeFilter({ name, path: name, operator: "gte", timezone: "UTC" });
  }

  override get type(): string {
    return "DateRangeFilter";
  }

  protected override with(state: FilterState): this {
    return new DateRangeFilter({ ...this.state, ...state }) as this;
  }

  /** The zone the business keeps its days in, which decides where one ends. */
  timezone(zone: string): this {
    return new DateRangeFilter({ ...this.state, timezone: zone }) as this;
  }

  /** Only the ends it could read, so the two boxes and the link agree. */
  override applied(value: string): string {
    const [from, to] = split(value);
    return `${from ?? ""}..${to ?? ""}`;
  }

  override clauses(value: string): readonly Clause[] {
    const [from, to] = split(value);
    const clauses: Clause[] = [];

    const start = from === undefined ? undefined : toInstant(from, this.state.timezone);
    if (start !== undefined) {
      clauses.push({ path: this.state.path, operator: "gte", value: start });
    }

    // The day after the one asked for, so the day asked for is included whole.
    const after = to === undefined ? undefined : dayAfter(to);
    const end = after === undefined ? undefined : toInstant(after, this.state.timezone);
    if (end !== undefined) {
      clauses.push({ path: this.state.path, operator: "lt", value: end });
    }

    return clauses;
  }
}

/**
 * The two ends, each present only if it is shaped like a day.
 *
 * Cut at the last separator rather than the first, which is the same rule the
 * range of numbers needs and so the same rule here. A value ending in a dot is
 * a decimal halfway through being typed, and joining it to an empty far end
 * makes three dots — read from the front, the reader's dot becomes the
 * separator and disappears from under them.
 */
function split(value: string): readonly [string | undefined, string | undefined] {
  const at = value.lastIndexOf("..");
  if (at === -1) return [undefined, undefined];

  const from = value.slice(0, at).trim();
  const to = value.slice(at + 2).trim();
  // Shaped like a day and also a day: `2026-02-30` passes the first test and is
  // read as the 2nd of March by anything that parses it.
  return [isRealDay(from) ? from : undefined, isRealDay(to) ? to : undefined];
}

/**
 * The next day on the calendar, month and year ends included.
 *
 * Counted in UTC and read back in UTC, which is not the filter's zone and does
 * not need to be: this is arithmetic on a date nobody has attached an hour to
 * yet. The zone is applied afterwards, once, where midnight is decided.
 */
function dayAfter(day: string): string | undefined {
  const parts = DAY.exec(day);
  if (parts === null) return undefined;

  const next = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + 1),
  );
  if (Number.isNaN(next.getTime())) return undefined;

  // Checked rather than trusted: past the year 9999 `toISOString` writes the
  // extended form, `+010000-01-01`, and the first ten characters of that are
  // not a day. It parses anyway, which is how it would have gone unnoticed.
  const after = next.toISOString().slice(0, 10);
  return isRealDay(after) ? after : undefined;
}

/**
 * Between two numbers, either end left open.
 *
 * Simpler than the range of dates above it, and for one reason: a number names
 * a point where a date names a whole day. So both ends are inclusive — "10 to
 * 20" holds 20 — and there is no zone to argue about and no day-after to work
 * out. What is left is deciding what counts as a number, which a URL has an
 * opinion about and this does not have to share.
 *
 * The shape is deliberately narrow: an optional sign, digits, and at most one
 * decimal part. No exponent, no `Infinity`, no hex, no leading `+`, no spaces
 * inside. Everything `Number()` would quietly accept and nobody would type.
 *
 * The value crosses as `from..to`, the same way the range of dates does, so a
 * narrowed page is still one link. Either side may be empty: `10..` is
 * everything from, `..20` everything up to.
 */
const NUMBER = /^-?\d+(?:\.\d+)?$/;

export class NumberRangeFilter extends Filter {
  static make(name: string): NumberRangeFilter {
    return new NumberRangeFilter({ name, path: name, operator: "gte" });
  }

  override get type(): string {
    return "NumberRangeFilter";
  }

  protected override with(state: FilterState): this {
    return new NumberRangeFilter(state) as this;
  }

  /** Only the ends it could read, so the two boxes and the link agree. */
  override applied(value: string): string {
    const [from, to] = ends(value);
    return `${from ?? ""}..${to ?? ""}`;
  }

  override clauses(value: string): readonly Clause[] {
    const [from, to] = ends(value);
    const clauses: Clause[] = [];

    // Both inclusive. A number is a point, not a span, so there is nothing at
    // the far end that `lte` would wrongly take in.
    if (from !== undefined) {
      clauses.push({ path: this.state.path, operator: "gte", value: figure(from) });
    }
    if (to !== undefined) {
      clauses.push({ path: this.state.path, operator: "lte", value: figure(to) });
    }

    return clauses;
  }
}

/** The number, and never minus nothing: `-0` is a value no column holds. */
function figure(text: string): number {
  const parsed = Number(text);
  return Object.is(parsed, -0) ? 0 : parsed;
}

/**
 * Whether a double names this number and not one beside it.
 *
 * A bound that rounds is a bound nobody asked for, and the rows on it end up
 * on the wrong side of a comparison with nothing to show that it moved:
 * `9007199254740993` comes back as `...992`, and `1.0000000000000001` comes
 * back as `1` — which is exactly the value a `Decimal` column exists to keep
 * apart from its neighbours.
 *
 * Asked by printing the double and comparing it with the text written the same
 * way. That also refuses the magnitudes where printing switches to an exponent
 * — a billion billion and up, a ten-millionth and down — which is the safe
 * direction and far outside anything typed into a box.
 */
function survives(text: string): boolean {
  return String(Number(text)) === plainly(text);
}

/** The same number without the zeros that carry no meaning. */
function plainly(text: string): string {
  const negative = text.startsWith("-");
  const [whole = "", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const left = whole.replace(/^0+(?=\d)/, "");
  const right = fraction.replace(/0+$/, "");
  const body = right === "" ? left : `${left}.${right}`;
  // Minus nothing is nothing, which is what printing a double says too.
  return negative && Number(body) !== 0 ? `-${body}` : body;
}

/** The two ends, each present only if it is a number this can carry exactly. */
function ends(value: string): readonly [string | undefined, string | undefined] {
  // The last separator, not the first: `1.` and an empty far end join into
  // `1...`, and cutting at the front hands the reader's decimal point to the
  // separator. A far end can never begin with a dot — a number here starts
  // with a digit — so the last cut is the only one that can be meant.
  const at = value.lastIndexOf("..");
  if (at === -1) return [undefined, undefined];

  const read = (text: string): string | undefined => {
    const trimmed = text.trim();
    if (!NUMBER.test(trimmed)) return undefined;
    return survives(trimmed) ? trimmed : undefined;
  };

  return [read(value.slice(0, at)), read(value.slice(at + 2))];
}
