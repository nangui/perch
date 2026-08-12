/**
 * `Hidden` — a value the reader never sets, and is never shown.
 *
 * It carries something the server owns through the form and into the write: a
 * tenant, an author, a slug computed from a title. The value comes from the
 * record or from `.default()`, and it goes to the database.
 *
 * What it does not do is accept anything from the client. "The reader cannot
 * see it" and "the reader cannot set it" are different sentences, and a form
 * field that reads as the first while meaning neither is the oldest hole there
 * is — `authorId` in a hidden input, rewritten in the console, saved as
 * somebody else's row. So the refusal is structural rather than a resolvable
 * flag: `disabled` would have been a lock whose key the form holds.
 *
 * Nor is it disclosed. "Hidden" names where a thing is drawn and never who may
 * read it, so the value is kept back from the browser entirely rather than
 * riding along in the page source where anyone can read it. Nothing is lost:
 * the server takes it from the row on every pass, which is also what stops a
 * `default()` from overwriting an edited column.
 *
 * It has no control, and no component. A field nobody sees needs no pixels.
 */
import { configured } from "../component.js";
import type { FieldState } from "../field.js";
import { baseFieldState, Field } from "../field.js";

export type HiddenState = FieldState;

export class Hidden extends Field {
  declare readonly state: HiddenState;

  override get type(): string {
    return "Hidden";
  }

  /** Never, and not because a flag says so. */
  override get acceptsClient(): boolean {
    return false;
  }

  static make(name: string): Hidden {
    return configured(new Hidden(baseFieldState(name)));
  }
}
