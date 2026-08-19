/**
 * `RepeatableEntry` — the rows of a to-many relation, read.
 *
 * A repeater without any of the things a repeater is: no keys, no order to
 * hold, nothing to add, nothing to write. Its rows come from what the record
 * carried, in the order it carried them, and the addressing decisions a form's
 * repeater had to make do not arise — there is nothing here a client may send,
 * so there is nothing for a path to have to keep apart.
 *
 * Its name is the relation on the record. The entries inside it name paths on
 * one of *its* rows, which is what makes an entry inside a form's repeater a
 * mistake and one inside this correct: the record they are read against is the
 * row, not the thing that holds it.
 */
import { configured } from "../component.js";
import type { EntryState } from "../entry.js";
import { Entry } from "../entry.js";

export class RepeatableEntry extends Entry {
  override get type(): string {
    return "RepeatableEntry";
  }

  protected override with(patch: Partial<EntryState>): this {
    return super.with(patch);
  }

  /** The relation on the record: `notes`, `items`, `comments`. */
  static make(name: string): RepeatableEntry {
    return configured(new RepeatableEntry({ name, children: [] }));
  }
}
