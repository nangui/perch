/**
 * `Toggle` — the same two values as a checkbox, and a different promise.
 *
 * A checkbox says "this will be true when you save". A switch says "this is
 * true now". They hold the same boolean and mean different things to the person
 * reading them, which is why both exist rather than one with a `.switch()` on
 * it: the choice between them is the choice of what to promise.
 *
 * What it does not have is a third state. A column that has never been written
 * holds null, and a switch cannot be half on — the renderer reads anything but
 * `true` as off, and the boundary refuses anything that is not a boolean.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

export interface ToggleState extends FieldState {
  /** Drawn in the knob when on, and when off. Decoration, never the only sign. */
  readonly onIcon?: string;
  readonly offIcon?: string;
  /** Which of the panel's colours the track takes when on. */
  readonly onColor?: "accent" | "success" | "danger";
}

export class Toggle extends Field {
  declare readonly state: ToggleState;

  override get type(): string {
    return "Toggle";
  }

  protected override with(patch: Partial<ToggleState>): this {
    return super.with(patch);
  }

  /** Flipping is a decision, not typing: it commits at once. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): Toggle {
    return configured(new Toggle(baseFieldState(name)));
  }

  onIcon(name: string): this {
    return this.with({ onIcon: name });
  }

  offIcon(name: string): this {
    return this.with({ offIcon: name });
  }

  onColor(colour: "accent" | "success" | "danger"): this {
    return this.with({ onColor: colour });
  }

  /** On or off. `"yes"` passes for a scalar and lands in a boolean column. */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return typeof value === "boolean" ? undefined : "wrong-shape";
  }

  /** Off is a value, and not one that satisfies being required. */
  override satisfiesRequired(value: unknown): boolean {
    return value === true;
  }
}
