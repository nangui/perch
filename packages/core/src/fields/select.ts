/**
 * `Select` — the most important field in the catalogue, and milestone A1 is
 * built out of two of them.
 */
import type { Resolvable } from "../component.js";
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import type { Option, OptionsInput } from "../option.js";
import { baseFieldState, Field, isScalarValue, isUnset } from "../field.js";

export interface SelectState extends FieldState {
  readonly options?: Resolvable<OptionsInput>;
  readonly relationship?: { readonly name: string; readonly labelField: string };
  readonly searchable: boolean;
  readonly multiple: boolean;
  readonly preload: boolean;
  readonly optionsLimit: number;
}

const DEFAULT_OPTIONS_LIMIT = 50;

export class Select extends Field {
  declare readonly state: SelectState;

  override get type(): string {
    return "Select";
  }

  protected override with(patch: Partial<SelectState>): this {
    return super.with(patch);
  }

  /** A discrete choice commits immediately. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): Select {
    const state: SelectState = {
      ...baseFieldState(name),
      searchable: false,
      multiple: false,
      preload: false,
      optionsLimit: DEFAULT_OPTIONS_LIMIT,
    };
    return configured(new Select(state));
  }

  override get declaredOptions(): Resolvable<OptionsInput> | undefined {
    return this.state.options;
  }

  options(value: Resolvable<OptionsInput>): this {
    return this.with({ options: value });
  }

  /** Loads the labels, searches them, persists the foreign key. */
  relationship(name: string, labelField = "name"): this {
    refuseBoth(this.state.multiple, name, this.name);
    return this.with({ relationship: { name, labelField } });
  }

  /** Searches on the server. Filtering 10k options in the browser is the bug. */
  searchable(value = true): this {
    return this.with({ searchable: value });
  }

  /**
   * Several values rather than one. The state becomes an array.
   *
   * Not on a relationship yet: choosing several rows is a write to a
   * many-to-many table, and nothing takes that path so far. Refused out loud
   * rather than accepted and quietly persisted as one value — a control that
   * lets you pick three and saves one is worse than a control that refuses.
   */
  multiple(value = true): this {
    if (value) refuseBoth(true, this.state.relationship?.name, this.name);
    return this.with({ multiple: value });
  }

  /** Loads every option up front; only safe on a bounded set. */
  preload(value = true): this {
    return this.with({ preload: value });
  }

  /**
   * The closed set closes here.
   *
   * A relation is exempt: its options are a window onto a table — fifty rows of
   * fifty thousand — so judging against them would refuse the very value being
   * edited. Its closed set is the table, and the foreign key is what closes it.
   *
   * Nothing declared means nothing is legal, not everything: a select with
   * neither options nor a relation is a mistake, and being lenient about it
   * would make the mistake into a way in.
   */
  override admits(
    value: unknown,
    options: readonly Option[] | undefined,
  ): ValueRefusal | undefined {
    const list = this.state.multiple;
    if (isUnset(value)) return undefined;
    if (Array.isArray(value) !== list) return "wrong-shape";

    const held = list ? (value as readonly unknown[]) : [value];
    if (held.some((one) => !isScalarValue(one))) return "wrong-shape";
    if (this.state.relationship !== undefined) return undefined;

    // Matched as text, because a form returns `"2"` for a key declared as `2`.
    //
    // An emptied multiple select arrives as `[]` and passes here, because
    // every member of nothing was declared. Said out loud rather than left to
    // be rediscovered: it is a clearing, and clearing is always allowed.
    const names = new Set((options ?? []).map((option) => String(option.value)));
    return held.every((one) => names.has(String(one))) ? undefined : "undeclared-value";
  }

  optionsLimit(value: number): this {
    return this.with({ optionsLimit: value });
  }
}

/** Declared in either order; refused the same way. */
function refuseBoth(
  multiple: boolean,
  relation: string | undefined,
  field: string,
): void {
  if (!multiple || relation === undefined) return;
  throw new Error(
    `\`${field}\` is a multiple select on the relation \`${relation}\`, and ` +
      `writing several rows of a relation is not supported yet`,
  );
}
