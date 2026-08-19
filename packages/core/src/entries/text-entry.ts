/**
 * `TextEntry` — a value from the record, as text.
 *
 * The first entry, and the plainest: it names a path and shows what is there.
 * Nothing is typed into it, so it has no rules, no default and no round trip.
 *
 * `.placeholder()` is what a reader sees where the record has nothing, which
 * is the difference between "empty" and "the page is broken". Without it an
 * absent value renders as a gap in the layout and says neither.
 */
import { configured } from "../component.js";
import type { EntryState } from "../entry.js";
import { Entry } from "../entry.js";

export class TextEntry extends Entry {
  override get type(): string {
    return "TextEntry";
  }

  protected override with(patch: Partial<EntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `title`, or `customer.email`. */
  static make(name: string): TextEntry {
    return configured(new TextEntry({ name, children: [] }));
  }
}
