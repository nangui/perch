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

/**
 * The panel's colours, by what they mean rather than by what they are.
 *
 * A name, not a hex: which red the panel uses is the theme's business, and an
 * entry that named one would be the one thing on the page a theme could not
 * change.
 */
export type EntryTone = "neutral" | "success" | "warning" | "danger";

/**
 * A fixed tone, or one chosen from the value.
 *
 * The value, not a `ResolverContext`: an entry's own value is the thing a tone
 * depends on, and it is not in the state map that `get()` reads. Asking an
 * author to write `({ record }) => record?.role` would be asking them to repeat
 * the path they already declared.
 *
 * Synchronous on purpose. This is a lookup table, and a colour worth waiting
 * for a query on is a column the record should be carrying.
 */
export type ToneChoice = EntryTone | ((value: unknown) => EntryTone | undefined);

/** How the value is turned into something a person reads. */
export type EntryFormat = "dateTime" | "numeric" | "money";

/**
 * Explicitly `| undefined`, unlike the rest of the tree's state: a formatter
 * has to be able to unset what the one before it had set, and `serialise` skips
 * an undefined value rather than putting the key on the wire.
 */
/** Built from the value it decorates, like a tone. */
export type UrlChoice = (value: unknown) => string | undefined;

export interface TextEntryState extends EntryState {
  readonly format?: EntryFormat;
  /** Which zone a timestamp is read in. The reader's own where unset. */
  readonly timezone?: string | undefined;
  /** ISO 4217, for `money`. */
  readonly currency?: string | undefined;
  /** Fixed places, for `numeric`. Unset lets the locale decide. */
  readonly decimals?: number | undefined;
  /** Drawn as a pill rather than as a line of text. */
  readonly badge?: true;
  readonly color?: ToneChoice;
  /** A button beside it that puts the whole value on the clipboard. */
  readonly copyable?: true;
  /** How much of it to show. The rest is still there to copy and to hover. */
  readonly limit?: number;
  /** `true` means the value is the address; a function builds one from it. */
  readonly url?: true | UrlChoice;
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

  /**
   * Drawn as a pill.
   *
   * For a value from a closed set — a status, a role, a stage — where the shape
   * says "this is one of a few things" before the word is even read. A pill
   * around a free-text field says that and is wrong.
   */
  badge(): this {
    return this.with({ badge: true });
  }

  /**
   * Which of the panel's colours it takes, fixed or chosen from the value.
   *
   * Resolved on the server like everything else conditional: the map from a
   * value to a meaning is a rule somebody wrote, and the browser has no way to
   * know it.
   */
  color(tone: ToneChoice): this {
    return this.with({ color: tone });
  }

  /**
   * A button beside it that copies the whole value.
   *
   * The whole one, not the shown one: `.limit()` shortens what is read, and
   * copying an ellipsis is worse than having no button at all.
   */
  copyable(): this {
    return this.with({ copyable: true });
  }

  /**
   * How much to show. What is cut is still there, to hover over and to copy.
   *
   * Shortened in the browser rather than here. A server that sent the first
   * eighty characters would make `.copyable()` a lie and leave nothing for the
   * title to say, and the value crosses either way.
   */
  limit(characters: number): this {
    return this.with({ limit: characters });
  }

  /**
   * Drawn as a link. No argument means the value is the address; a function
   * builds one from it — `mailto:` and the like.
   *
   * The address is built and checked on the server. A stored value put straight
   * into an `href` is how `javascript:` becomes somebody else's script, and a
   * browser is not the place to find that out.
   */
  url(build?: UrlChoice): this {
    return this.with({ url: build ?? true });
  }
}

/**
 * The schemes a panel will link to, and nothing else.
 *
 * An allowlist, like every other decision here that reads off a declaration. A
 * denylist of `javascript:` misses `data:`, and `vbscript:`, and whatever a
 * browser adds next.
 */
const SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * A base nothing resolves to by accident, for asking what a browser would do.
 *
 * `.invalid` is reserved and resolves nowhere, so a path that comes back on
 * this origin is a path that stays where it was.
 */
const NOWHERE = "https://perch.invalid";

/**
 * A path on this origin, normalised, or nothing.
 *
 * Asked of the same parser a browser uses rather than matched by shape. Testing
 * for `//` looks like it covers it and does not: a browser reads `/\host` as
 * `//host` for a special scheme, and strips tabs and newlines before it reads
 * anything — so `/⇥/host` is another origin too. Both were accepted here.
 */
export function safePath(value: string): string | undefined {
  try {
    const url = new URL(value, NOWHERE);
    if (url.origin !== NOWHERE) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

/**
 * An address worth putting in an `href`, or nothing.
 *
 * Nothing means the value is drawn as text: a link that does not link is what a
 * reader should see, rather than one that runs something. Silent, because the
 * value came from a row and the row may have come from anywhere.
 */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const raw = value.trim();

  if (raw.startsWith("/")) return safePath(raw);

  try {
    return SCHEMES.has(new URL(raw).protocol) ? raw : undefined;
  } catch {
    return undefined;
  }
}
