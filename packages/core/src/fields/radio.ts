/**
 * `Radio` — one of a few, all of them visible.
 *
 * A select hides its choices behind a click and scales to fifty thousand; a
 * radio group shows every one at once and stops being usable past a handful.
 * That is the whole difference, and it is why both exist rather than one with
 * a flag: the choice between them is a claim about how many there are.
 *
 * `.inline()` lays the choices in a row. It says nothing about the label —
 * `.inlineLabel()` on every field says that, because Filament spent years with
 * one word meaning both and split them in v4.
 */
import { configured } from "../component.js";
import type { Resolvable } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isScalarValue, isUnset } from "../field.js";
import type { Option, OptionsInput } from "../option.js";

export interface RadioState extends FieldState {
  readonly options?: Resolvable<OptionsInput>;
  /** The choices in a row rather than stacked. Never about the label. */
  readonly inline: boolean;
}

export class Radio extends Field {
  declare readonly state: RadioState;

  override get type(): string {
    return "Radio";
  }

  protected override with(patch: Partial<RadioState>): this {
    return super.with(patch);
  }

  /** Picking is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): Radio {
    const state: RadioState = { ...baseFieldState(name), inline: false };
    return configured(new Radio(state));
  }

  override get declaredOptions(): Resolvable<OptionsInput> | undefined {
    return this.state.options;
  }

  options(value: Resolvable<OptionsInput>): this {
    return this.with({ options: value });
  }

  inline(value = true): this {
    return this.with({ inline: value });
  }

  /**
   * The closed set, closed here.
   *
   * Every choice is on the page, so there is no window and no relation to
   * excuse a value from outside the list. Nothing declared means nothing legal.
   */
  override admits(
    value: unknown,
    options: readonly Option[] | undefined,
  ): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!isScalarValue(value)) return "wrong-shape";

    // Matched as text, because a form returns `"2"` for a key declared as `2`.
    const names = new Set((options ?? []).map((option) => String(option.value)));
    return names.has(String(value)) ? undefined : "undeclared-value";
  }
}
