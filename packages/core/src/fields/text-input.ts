/**
 * `TextInput`. The flavours are the union `inference.ts` produces from the IR,
 * so a hand-written field and an inferred one describe themselves the same way.
 */
import { configured } from "../component.js";
import type { FieldState, ValidationRule } from "../field.js";
import { baseFieldState, Field, lengthRules } from "../field.js";
import type { TextFlavour } from "../inference.js";

export interface TextInputState extends FieldState {
  readonly flavour: TextFlavour;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** `ignoreRecord` excludes the row being edited from the uniqueness check. */
  readonly unique?: { readonly ignoreRecord: boolean };
  readonly step?: number;
}

export class TextInput extends Field {
  declare readonly state: TextInputState;

  override get type(): string {
    return "TextInput";
  }

  protected override with(patch: Partial<TextInputState>): this {
    return super.with(patch);
  }

  override get declaredRules(): readonly ValidationRule[] {
    return [
      ...lengthRules(this.state.minLength, this.state.maxLength),
      ...stepRules(this.state.step),
    ];
  }

  static make(name: string): TextInput {
    // A typed variable, not a literal: the excess property check only fires on
    // fresh literals, and would otherwise force a widening constructor.
    const state: TextInputState = { ...baseFieldState(name), flavour: "text" };
    return configured(new TextInput(state));
  }

  email(): this {
    return this.with({ flavour: "email" });
  }

  url(): this {
    return this.with({ flavour: "url" });
  }

  /** A blank password must not overwrite the stored hash with "". */
  password(): this {
    return this.with({ flavour: "password", dehydrateWhenEmpty: false });
  }

  tel(): this {
    return this.with({ flavour: "tel" });
  }

  /**
   * A number, and optionally the grain it comes in: `0.5`, `100`, `0.01`.
   *
   * The step is enforced here rather than by the browser. The control is
   * deliberately not `type="number"` — spinners, silent locale parsing, a
   * scroll-wheel trap — and `step` means nothing on anything else, so a reader
   * is never stopped from typing `2.45`. They are told when they try to save
   * it, which is the honest half of "the state is authoritative on the server".
   */
  numeric(step?: number): this {
    return this.with({ flavour: "numeric", ...(step === undefined ? {} : { step }) });
  }

  minLength(value: number): this {
    return this.with({ minLength: value });
  }

  maxLength(value: number): this {
    return this.with({ maxLength: value });
  }

  /** Defaults to ignoring the row being edited, or editing it fails its own check. */
  unique(options: { readonly ignoreRecord?: boolean } = {}): this {
    return this.with({ unique: { ignoreRecord: options.ignoreRecord ?? true } });
  }
}

/**
 * The grain a declared step implies.
 *
 * Not a modulo. `2.4 % 0.1` is 0.09999999999999978 in binary floating point, so
 * the obvious check refuses the value it was written to allow. Dividing and
 * looking at how far the quotient sits from a whole number keeps the error
 * where it belongs — at the fifteenth decimal, which no step reaches.
 *
 * A value that is not a number passes. That is a different complaint, and one
 * nothing makes yet.
 */
function stepRules(step: number | undefined): readonly ValidationRule[] {
  if (step === undefined) return [];
  return [
    (value) => {
      const amount = numberOf(value);
      if (amount === undefined) return true;
      return onTheStep(amount, step) ? true : `Must be a multiple of ${String(step)}.`;
    },
  ];
}

/** A number, or a string of one. The wire carries both, from a row and a form. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function onTheStep(value: number, step: number): boolean {
  // A step that is not a positive number is a declaration the boot refuses, so
  // this never divides by one. Answering `true` is what a rule does when it has
  // nothing to say.
  if (!Number.isFinite(step) || step <= 0) return true;
  const quotient = value / step;
  const nearest = Math.round(quotient);
  return Math.abs(quotient - nearest) <= 1e-9 * Math.max(1, Math.abs(quotient));
}
