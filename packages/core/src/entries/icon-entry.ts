/**
 * A mark instead of a word, in an infolist.
 *
 * What it shows is a shape the panel draws, chosen from the value by a rule the
 * resource wrote. The rule runs on the server and only its answer crosses the
 * wire: a browser handed `{ draft: "pencil", live: "check" }` would be a
 * browser deciding what a row means, which is the one thing the client never
 * does here.
 *
 * `.boolean()` is the case that comes up most and reads worst when spelt out —
 * a column of `true` and `false` is a column nobody scans. It is a tick and a
 * cross, and they are drawings like every other mark the panel makes.
 *
 * Not an `IconColumn`, which is the same idea in a table and answers to a
 * different renderer on purpose: a table draws one memoised function per column
 * type across every row, and an entry is drawn once for one record. Sharing a
 * component between them would put a row's cost on the page that has no rows.
 */
import { configured } from "../component.js";
import { Entry } from "../entry.js";
import type { EntryState } from "../entry.js";
import type { EntryTone } from "./text-entry.js";
import type { IconName } from "../icon.js";

/** A fixed mark, or one worked out from the value. */
export type IconChoice = IconName | ((value: unknown) => IconName | undefined);

/** The same, for which of the panel's four colours it takes. */
export type IconToneChoice = EntryTone | ((value: unknown) => EntryTone | undefined);

export interface IconEntryState extends EntryState {
  /** A tick for true and a cross for false, which `.icons()` then overrides. */
  readonly boolean?: true;
  readonly icons?: IconChoice;
  readonly colors?: IconToneChoice;
}

export class IconEntry extends Entry {
  declare readonly state: IconEntryState;

  override get type(): string {
    return "IconEntry";
  }

  protected override with(patch: Partial<IconEntryState>): this {
    return super.with(patch);
  }

  /** The path into the record: `active`, or `subscription.status`. */
  static make(name: string): IconEntry {
    return configured(new IconEntry({ name, children: [] }));
  }

  /**
   * A tick for true, a cross for false, and nothing for neither.
   *
   * Nothing rather than a third mark: a value that is absent is not a value
   * that is false, and drawing one for the other is a lie the reader cannot
   * see through.
   */
  boolean(): this {
    return this.with({ boolean: true });
  }

  /**
   * Which mark, fixed or chosen from the value.
   *
   * Every answer is a name from the panel's set, so a misspelling is a compile
   * error here and a refusal at boot for anything that got past the type.
   */
  icons(choice: IconChoice): this {
    return this.with({ icons: choice });
  }

  /** Which of the panel's four colours the mark takes. */
  colors(choice: IconToneChoice): this {
    return this.with({ colors: choice });
  }
}

/**
 * The mark this value gets, decided here and not in a browser.
 *
 * `.icons()` wins over `.boolean()` where both were declared: one is a default
 * for the commonest case and the other is what the resource actually meant.
 */
export function markFor(entry: IconEntry, value: unknown): IconName | undefined {
  const chosen = entry.state.icons;
  if (chosen !== undefined) {
    return typeof chosen === "function" ? chosen(value) : chosen;
  }
  if (entry.state.boolean !== true) return undefined;
  // Neither true nor false is neither mark: an absent value is not a false one.
  if (value === true) return "check";
  return value === false ? "close" : undefined;
}
