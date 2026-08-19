/**
 * `TextEntry` — a value from the record, as text.
 *
 * It names a path and shows what is there. Nothing is typed into it, so it has
 * no rules, no default and no round trip.
 *
 * `.placeholder()` is what a reader sees where the record has nothing, which is
 * the difference between "empty" and "the page is broken". Without it an absent
 * value renders as a gap in the layout and says neither.
 *
 * Formatting is declared here and applied in the browser. The rule is the
 * server's — which zone a timestamp is read in, which currency an amount is —
 * and the locale is the reader's, which only their browser knows. Sending
 * `2026-06-15T08:00:00.000Z` with `Europe/Paris` beside it lets one reader see
 * a French date and another an American one from the same answer; formatting it
 * here would pick for both of them.
 */
import { configured } from "../component.js";
import type { EntryState } from "../entry.js";
import { Entry } from "../entry.js";

/** How the value is turned into something a person reads. */
export type EntryFormat = "dateTime" | "numeric" | "money";

/**
 * Explicitly `| undefined`, unlike the rest of the tree's state: a formatter
 * has to be able to unset what the one before it had set, and `serialise` skips
 * an undefined value rather than putting the key on the wire.
 */
export interface TextEntryState extends EntryState {
  readonly format?: EntryFormat;
  /** Which zone a timestamp is read in. The reader's own where unset. */
  readonly timezone?: string | undefined;
  /** ISO 4217, for `money`. */
  readonly currency?: string | undefined;
  /** Fixed places, for `numeric`. Unset lets the locale decide. */
  readonly decimals?: number | undefined;
}

/**
 * What every formatter starts from.
 *
 * The last call decides, so the settings of the one before it have to go with
 * it. Left behind, a `timezone` rides on an amount: harmless to the renderer,
 * which reads only what the format calls for, and a lie to anybody reading the
 * payload to find out what this entry was told to do.
 */
const CLEARED = {
  timezone: undefined,
  currency: undefined,
  decimals: undefined,
} satisfies Partial<TextEntryState>;

export class TextEntry extends Entry {
  declare readonly state: TextEntryState;

  override get type(): string {
    return "TextEntry";
  }

  protected override with(patch: Partial<TextEntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `title`, or `customer.email`. */
  static make(name: string): TextEntry {
    return configured(new TextEntry({ name, children: [] }));
  }

  /**
   * A date and a time, read in `timezone` — the reader's own where none is
   * named. What is stored is an instant; what is shown is a wall clock, and
   * which wall is a decision somebody has to make.
   */
  dateTime(options: { readonly timezone?: string } = {}): this {
    return this.with({
      ...CLEARED,
      format: "dateTime",
      ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
    });
  }

  /** A number, grouped the way the reader's locale groups numbers. */
  numeric(options: { readonly decimals?: number } = {}): this {
    return this.with({
      ...CLEARED,
      format: "numeric",
      ...(options.decimals === undefined ? {} : { decimals: options.decimals }),
    });
  }

  /** An amount, in a currency the record does not carry and the form declares. */
  money(currency: string): this {
    return this.with({ ...CLEARED, format: "money", currency });
  }
}
