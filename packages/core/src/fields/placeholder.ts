/**
 * `Placeholder` — something to read, and nothing to save.
 *
 * A computed line in the middle of a form: the total of what is above it, when
 * a row was last written, which of two prices applies. It holds no state a
 * client may set and writes nothing to the database, which makes it the one
 * field in the catalogue that is purely an answer.
 *
 * `.content()` takes a resolver and is resolved on every pass, not hydrated
 * once. A line that reads another field has to be recomputed when that field
 * changes, and `default()` fills a blank exactly one time.
 */
import { configured } from "../component.js";
import type { Resolvable } from "../component.js";
import type { FieldState } from "../field.js";
import { baseFieldState, Field } from "../field.js";

export interface PlaceholderState extends FieldState {
  readonly content?: Resolvable<string>;
}

export class Placeholder extends Field {
  declare readonly state: PlaceholderState;

  override get type(): string {
    return "Placeholder";
  }

  protected override with(patch: Partial<PlaceholderState>): this {
    return super.with(patch);
  }

  /** Nothing to set: it is a reading, not a control. */
  override get acceptsClient(): boolean {
    return false;
  }

  static make(name: string): Placeholder {
    // `dehydrated: false` in the state rather than a rule elsewhere: a field
    // that writes nothing should say so where somebody reading it will look.
    const state: PlaceholderState = { ...baseFieldState(name), dehydrated: false };
    return configured(new Placeholder(state));
  }

  content(value: Resolvable<string>): this {
    return this.with({ content: value });
  }
}
