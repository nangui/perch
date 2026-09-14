/**
 * `KeyValueEntry` — the pairs in a `Json` column, shown as pairs.
 *
 * The same two columns the form edits, named the same way, read by the same
 * rule. A reader who edits a settings column and then looks at it should not
 * have to work out why the two pages disagree about what is in it.
 *
 * The reading happens on the server. What a `Json` column holds is a shape
 * nobody here chose, and deciding which of its entries is a row — a key with
 * space around it, the same name twice, a value that is not text — is a rule
 * somebody wrote. The browser is handed the answer, not the rule.
 */
import { configured } from "../component.js";
import { Entry } from "../entry.js";
import type { EntryState } from "../entry.js";

export interface KeyValueEntryState extends EntryState {
  /** What the first column is called. "Key" unless told otherwise. */
  readonly keyLabel?: string;
  readonly valueLabel?: string;
}

export class KeyValueEntry extends Entry {
  declare readonly state: KeyValueEntryState;

  override get type(): string {
    return "KeyValueEntry";
  }

  protected override with(patch: Partial<KeyValueEntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `settings`, or `meta.headers`. */
  static make(name: string): KeyValueEntry {
    return configured(new KeyValueEntry({ name, children: [] }));
  }

  keyLabel(value: string): this {
    return this.with({ keyLabel: value });
  }

  valueLabel(value: string): this {
    return this.with({ valueLabel: value });
  }
}
