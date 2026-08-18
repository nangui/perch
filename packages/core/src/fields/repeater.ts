/**
 * `Repeater` — a schema the reader repeats.
 *
 * Its value is not the rows. It is the ordered list of their keys, and that one
 * value is both the order and the membership: the tree is resolved from it, so
 * every `items.<key>.<field>` path exists in the map the trust boundary checks
 * against, and a path naming a row nobody declared is refused by the rule that
 * already refuses everything else.
 *
 * Which makes this the first field whose value decides what other paths mean —
 * and the reason its own value is judged before any of them is.
 *
 * A key is opaque. Nothing here parses it, compares it or orders by it; what a
 * key means at write time is decided by the record, where the children that
 * were actually loaded are the only ones an update can reach.
 *
 * The fields one row holds are its children, set by the `.schema([])` every
 * layout already has. A row is a section that happens many times.
 */
import { configured } from "../component.js";
import type { Resolvable } from "../component.js";
import type { FieldState, ValidationRule, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

/**
 * How long a key may be.
 *
 * It is a map key, a path segment and a piece of every payload the row appears
 * in. Nothing reads it, so nothing needs it long — and a client that may invent
 * paths does not also get to decide how much of a request one of them takes.
 */
export const MAX_ROW_KEY_LENGTH = 64;

export interface RepeaterState extends FieldState {
  /** The relation the rows are written to. */
  readonly relationship?: string;
  /** Where a loaded row keeps its key. `id` unless a model says otherwise. */
  readonly rowKey?: string;
  /** Names one row. Resolved per row, reading that row's own fields. */
  readonly itemLabel?: Resolvable<string>;
  /** Rows can be folded away. Which are folded is the reader's, not the form's. */
  readonly collapsible?: boolean;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export class Repeater extends Field {
  declare readonly state: RepeaterState;

  override get type(): string {
    return "Repeater";
  }

  protected override with(patch: Partial<RepeaterState>): this {
    return super.with(patch);
  }

  /** Adding or removing a row is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  /**
   * Live by construction, not by declaration.
   *
   * Every other field asks the server because its author wanted something to
   * follow it. This one has to, whatever anybody wanted: its value is what
   * says which rows exist, so a row added without a round trip is a row the
   * tree has never heard of — drawn with no fields in it, for as long as
   * nothing else on the form happens to ask.
   */
  static make(name: string): Repeater {
    const state: RepeaterState = {
      ...baseFieldState(name),
      live: { debounce: 0, onBlur: false },
    };
    return configured(new Repeater(state));
  }

  relationship(name: string): this {
    return this.with({ relationship: name });
  }

  /**
   * Where a loaded row keeps the key an update is addressed by.
   *
   * `id` unless a model says otherwise. Getting this wrong is not a small
   * mistake: an update that cannot find its row becomes a create, so every
   * save duplicates instead of editing — which is why a relation that comes
   * back with rows and none of this key is an error rather than a shrug.
   */
  rowKey(name: string): this {
    return this.with({ rowKey: name });
  }

  /**
   * What one row is called.
   *
   * Resolved once per row, and reading that row's fields by their own names:
   * `({ get }) => get("body")` means this row's body. An author cannot write
   * the absolute path, because the key that would complete it is invented at
   * the moment the row is added.
   *
   * Rows are otherwise told apart by their position, which changes the moment
   * anything is reordered.
   */
  itemLabel(value: Resolvable<string>): this {
    return this.with({ itemLabel: value });
  }

  /**
   * Lets a reader fold a row away.
   *
   * Which rows are folded is nobody's business but the reader's: it is not
   * state, it changes nothing, and it does not survive the page. So it is
   * declared here and decided there — the only thing the server says is that
   * folding is offered at all.
   *
   * Worth having where a row is large enough that five of them are a wall.
   * Pair it with `.itemLabel()`, or a folded row says nothing about itself.
   */
  collapsible(value = true): this {
    return this.with({ collapsible: value });
  }

  minItems(count: number): this {
    return this.with({ minItems: count });
  }

  maxItems(count: number): this {
    return this.with({ maxItems: count });
  }

  /**
   * The list, and nothing but a list.
   *
   * `maxItems` is checked here rather than only in validation, and that is the
   * difference between a rule and a boundary: a rejected value is still a value
   * the tree gets resolved from, so a list of ten thousand keys would build ten
   * thousand sub-trees before anything got round to complaining about it.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!Array.isArray(value)) return "wrong-shape";

    const { maxItems } = this.state;
    if (maxItems !== undefined && value.length > maxItems) return "undeclared-value";

    const seen = new Set<string>();
    for (const key of value) {
      if (typeof key !== "string") return "wrong-shape";
      if (key === "" || key.length > MAX_ROW_KEY_LENGTH) return "wrong-shape";
      // Two rows under one key is one row, twice — and whichever is written
      // second would silently be the one that survived.
      if (seen.has(key)) return "undeclared-value";
      seen.add(key);
    }
    return undefined;
  }

  /**
   * `minItems` and `maxItems`, as rules that say so.
   *
   * `minItems` is the one a reader meets: too few rows is a state the boundary
   * has no reason to refuse, so the rule is what reports it.
   *
   * `maxItems` is different, and the difference is worth knowing. The boundary
   * refuses the whole list before this ever runs, so the rule fires for nobody
   * — the value it would judge never reaches the state. It is declared anyway
   * because a rule that exists only in one of the two places is how the two
   * drift apart, and because the client is what keeps a reader from getting
   * there: it stops offering another row at the limit.
   */
  override get declaredRules(): readonly ValidationRule[] {
    const { minItems, maxItems } = this.state;
    const rules: ValidationRule[] = [];

    if (minItems !== undefined) {
      rules.push((value) =>
        count(value) >= minItems
          ? true
          : `Add at least ${String(minItems)} ${plural(minItems, "row")}.`,
      );
    }
    if (maxItems !== undefined) {
      rules.push((value) =>
        count(value) <= maxItems
          ? true
          : `Keep this to ${String(maxItems)} ${plural(maxItems, "row")}.`,
      );
    }
    return rules;
  }

  /** A repeater with no rows is a repeater nobody filled in. */
  override satisfiesRequired(value: unknown): boolean {
    return count(value) > 0;
  }
}

/** An unset repeater has no rows, which is not the same as an unknown number. */
function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
