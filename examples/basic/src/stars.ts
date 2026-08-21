/**
 * A field this package did not write, written the way somebody else would.
 *
 * Nothing here reaches inside the framework: it extends what `@perchjs/core`
 * exports, names its own type, and says which of its own state keys cross to
 * the browser. What draws it is `public/stars.js`, which the panel loads and
 * which registers against the global the bundle publishes — no bundler, no
 * build step, no import of the panel's own code.
 */
import type { FieldState } from "@perchjs/core";
import { baseFieldState, configured, Field } from "@perchjs/core";

interface StarsState extends FieldState {
  readonly most?: number;
}

export class Stars extends Field {
  declare readonly state: StarsState;

  override get type(): string {
    return "StarRating";
  }

  /** What its renderer needs and this package knows nothing about. */
  override get sends(): readonly string[] {
    return ["most"];
  }

  protected override with(patch: Partial<StarsState>): this {
    return super.with(patch);
  }

  static make(name: string): Stars {
    return configured(new Stars(baseFieldState(name)));
  }

  most(value: number): this {
    return this.with({ most: value });
  }
}
