/**
 * `CheckboxList` — several of a few, all of them visible.
 *
 * A `Radio` with the arithmetic changed: every choice on the page at once, and
 * any number of them taken. What separates it from a multiple `Select` is the
 * same thing that separates a radio from a single one — a select hides its
 * choices behind a click and scales to fifty thousand, and a list of checkboxes
 * shows every one and stops being usable past a handful. Choosing between them
 * is a claim about how many there are.
 *
 * Its value is a list, and an empty one is a real answer: it says the reader
 * unticked everything, which is different from never having been asked.
 */
import { configured } from "../component.js";
import type { Resolvable } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isScalarValue, isUnset } from "../field.js";
import type { Option, OptionsInput } from "../option.js";

export interface CheckboxListState extends FieldState {
  readonly options?: Resolvable<OptionsInput>;
  /** How many columns the choices are laid out in. One unless told. */
  readonly columns?: number;
  /** A control that ticks and unticks the lot. */
  readonly bulkToggleable: boolean;
}

export class CheckboxList extends Field {
  declare readonly state: CheckboxListState;

  override get type(): string {
    return "CheckboxList";
  }

  protected override with(patch: Partial<CheckboxListState>): this {
    return super.with(patch);
  }

  /** Ticking is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): CheckboxList {
    const state: CheckboxListState = {
      ...baseFieldState(name),
      bulkToggleable: false,
    };
    return configured(new CheckboxList(state));
  }

  override get declaredOptions(): Resolvable<OptionsInput> | undefined {
    return this.state.options;
  }

  options(value: Resolvable<OptionsInput>): this {
    return this.with({ options: value });
  }

  /** Down columns rather than one long stack. A layout choice, nothing more. */
  columns(value: number): this {
    return this.with({ columns: value });
  }

  /**
   * One control that ticks and unticks every choice.
   *
   * Worth having exactly where the list is long enough to make ticking twelve
   * boxes tedious, which is the same length at which this field stops being the
   * right one. Offered rather than assumed, so the author decides.
   */
  bulkToggleable(value = true): this {
    return this.with({ bulkToggleable: value });
  }

  /**
   * A list, and a closed one.
   *
   * Every choice is on the page, so there is no window and no relation to
   * excuse a value from outside the list — the same reading a radio gets, and
   * for the same reason. Nothing declared means nothing legal.
   *
   * An emptied list arrives as `[]` and is admitted, because every member of
   * nothing was declared. Said out loud rather than left to be rediscovered:
   * it is a clearing, and clearing is always allowed.
   */
  override admits(
    value: unknown,
    options: readonly Option[] | undefined,
  ): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!Array.isArray(value)) return "wrong-shape";
    if (value.some((one) => !isScalarValue(one))) return "wrong-shape";

    // Matched as text, because a form returns `"2"` for a key declared as `2`.
    const names = new Set((options ?? []).map((option) => String(option.value)));
    return value.every((one) => names.has(String(one)))
      ? undefined
      : "undeclared-value";
  }
}
