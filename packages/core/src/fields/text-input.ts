/**
 * `TextInput`. The flavours are the union `inference.ts` produces from the IR,
 * so a hand-written field and an inferred one describe themselves the same way.
 */
import { configured } from "../component.js";
import type { FieldState } from "../field.js";
import { baseFieldState, Field } from "../field.js";
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
