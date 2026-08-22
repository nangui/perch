/**
 * `ToggleButtons` — a radio group wearing buttons.
 *
 * The same claim as a radio group makes: every choice is on the page, so there
 * are few of them and the set is closed. What differs is how much room they ask
 * for and how hard they are to hit — a row of buttons is one gesture on a
 * phone, where a stack of dots is a careful one.
 *
 * That is the whole difference, so it is the whole field. Anything a radio
 * group can hold this holds, and the boundary reads it the same way.
 */
import { configured } from "../component.js";
import type { Resolvable } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isScalarValue, isUnset } from "../field.js";
import type { Option, OptionsInput } from "../option.js";
import { choosableValues } from "../option.js";

export interface ToggleButtonsState extends FieldState {
  readonly options?: Resolvable<OptionsInput>;
  /** The choices in a row rather than stacked. Never about the label. */
  readonly inline: boolean;
  /** The choices joined into one block, sharing their edges. */
  readonly grouped: boolean;
}

export class ToggleButtons extends Field {
  declare readonly state: ToggleButtonsState;

  override get type(): string {
    return "ToggleButtons";
  }

  protected override with(patch: Partial<ToggleButtonsState>): this {
    return super.with(patch);
  }

  /** Picking is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): ToggleButtons {
    const state: ToggleButtonsState = {
      ...baseFieldState(name),
      inline: false,
      grouped: false,
    };
    return configured(new ToggleButtons(state));
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
   * The choices as one block, each sharing an edge with the next.
   *
   * A segmented control rather than a row of separate buttons, which is what
   * "one of these" looks like when the choices are two or three words each.
   * Sharing an edge means standing in a row, so the drawing lays them in one
   * whatever `.inline()` says — settled where it is drawn rather than here,
   * because a builder that writes one method from another answers differently
   * depending on which was written first.
   */
  grouped(value = true): this {
    return this.with({ grouped: value });
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

    return choosableValues(options).has(String(value)) ? undefined : "undeclared-value";
  }
}
