/**
 * `Checkbox` — one box, on or off.
 *
 * `required` on it means checked, which is what the HTML attribute of the same
 * name means and what "accept the terms" needs. That is why the question the
 * resolution asks is `satisfiesRequired` rather than "is it blank": `false` is
 * a perfectly good value for a checkbox to hold, and a very poor one for it to
 * hold when it was made mandatory.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

export type CheckboxState = FieldState;

export class Checkbox extends Field {
  declare readonly state: CheckboxState;

  override get type(): string {
    return "Checkbox";
  }

  protected override with(patch: Partial<CheckboxState>): this {
    return super.with(patch);
  }

  /** Ticking is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): Checkbox {
    return configured(new Checkbox(baseFieldState(name)));
  }

  /** Ticked or not. `"yes"` passes for a scalar and lands in a boolean column. */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return typeof value === "boolean" ? undefined : "wrong-shape";
  }

  /** Unchecked is a value, and not one that satisfies being required. */
  override satisfiesRequired(value: unknown): boolean {
    return value === true;
  }
}
