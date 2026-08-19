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
   * The clause a value produces, or nothing.
   *
   * The value is the only thing here that came from outside, and it lands in
   * `value` alone. Returning nothing is how a filter says it was left blank,
   * which is different from saying it matched nothing.
   */
  abstract clause(value: string): Clause | undefined;

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
  override clause(): Clause | undefined {
    return undefined;
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

  override clause(value: string): Clause | undefined {
    const term = value.trim();
    if (term === "") return undefined;

    return { path: this.state.path, operator: this.state.operator, value: term };
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

  override clause(value: string): Clause | undefined {
    // Matched as a string because that is what a URL carries, and answered with
    // the declared value because that is what the column holds.
    const chosen = this.choices.find((option) => String(option.value) === value);
    if (chosen === undefined) return undefined;

    return {
      path: this.state.path,
      operator: this.state.operator,
      value: chosen.value,
    };
  }
}
