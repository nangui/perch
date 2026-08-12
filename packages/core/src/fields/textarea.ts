/**
 * `Textarea` — long text.
 *
 * Its own field rather than a flag on `TextInput`, because the two differ in
 * what they promise a reader: one line that scrolls, or a box you can see the
 * whole of. `.rows()` is that promise made concrete, and `.autosize()` hands
 * it to the content.
 *
 * `.maxLength()` is checked here as well as counted in the footer. The count
 * under the box and the error under that have to agree, and a limit the server
 * never looked at is a limit a forged request never had.
 */
import { configured } from "../component.js";
import type { FieldState, ValidationRule } from "../field.js";
import { baseFieldState, Field, lengthRules } from "../field.js";

export interface TextareaState extends FieldState {
  /** How tall it starts. A floor, not a ceiling — long text still scrolls. */
  readonly rows?: number;
  /** Grows with what is in it, from `rows` upward. */
  readonly autosize: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export class Textarea extends Field {
  declare readonly state: TextareaState;

  override get type(): string {
    return "Textarea";
  }

  protected override with(patch: Partial<TextareaState>): this {
    return super.with(patch);
  }

  override get declaredRules(): readonly ValidationRule[] {
    return lengthRules(this.state.minLength, this.state.maxLength);
  }

  static make(name: string): Textarea {
    const state: TextareaState = { ...baseFieldState(name), autosize: false };
    return configured(new Textarea(state));
  }

  rows(value: number): this {
    return this.with({ rows: value });
  }

  autosize(value = true): this {
    return this.with({ autosize: value });
  }

  minLength(value: number): this {
    return this.with({ minLength: value });
  }

  /** Counted under the box, and refused above it. Never silently truncated. */
  maxLength(value: number): this {
    return this.with({ maxLength: value });
  }
}
