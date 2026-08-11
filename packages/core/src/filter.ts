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
import type { Clause, ClauseOperator } from "./data-adapter.js";

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
