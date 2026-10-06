/**
 * The cards a dashboard draws, each asking for its own numbers.
 *
 * The roster arrives with the page and the numbers do not. So the grid is on
 * screen before a single aggregate has run, and a dashboard of eight heavy
 * ones draws at once and fills in — which is the whole reason a widget has a
 * route of its own.
 *
 * One request per card, and one piece of state per card, so a failure is local
 * by construction rather than by anybody remembering to catch it in the right
 * place. The slow one is slow alone and the broken one shows a line in its own
 * box with the others untouched.
 *
 * Nothing here decides which cards there are, nor which a reader may see. The
 * server sent the list, already narrowed, with the address for each.
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { StatNode } from "@perchjs/core";
import { stat } from "./styled-system/recipes/index.js";
import { IconMark } from "./icons.js";

/** One card's place and address, as the shell sent it. */
export interface WidgetCard {
  readonly name: string;
  readonly href: string;
  readonly columnSpan?: number;
}

export interface PanelWidgetsProps {
  readonly widgets: readonly WidgetCard[];
  /**
   * Asked once per card.
   *
   * Handed in rather than called from in here, for the reason every other
   * transport in this package is: the grid can then be driven without a
   * network, and this file knows nothing about how a request is made.
   */
  readonly load: (card: WidgetCard) => Promise<readonly StatNode[]>;
}

export function PanelWidgets({ widgets, load }: PanelWidgetsProps): ReactNode {
  // No grid at all rather than an empty one. A page that holds no card, and a
  // page whose every card this reader may not have, are the same page.
  if (widgets.length === 0) return null;

  return (
    <div className="perch-widgets">
      {widgets.map((card) => (
        <Widget key={card.name} card={card} load={load} />
      ))}
    </div>
  );
}

type Asked =
  | { readonly kind: "asking" }
  | { readonly kind: "answered"; readonly stats: readonly StatNode[] }
  | { readonly kind: "failed" };

function Widget({
  card,
  load,
}: {
  readonly card: WidgetCard;
  readonly load: PanelWidgetsProps["load"];
}): ReactNode {
  const [asked, setAsked] = useState<Asked>({ kind: "asking" });
  const live = useRef(true);
  /** Which attempt is the current one, so a retry's answer wins over a stale. */
  const attempt = useRef(0);

  const ask = (): void => {
    const mine = (attempt.current += 1);
    setAsked({ kind: "asking" });
    void load(card).then(
      (stats) => {
        if (live.current && mine === attempt.current) {
          setAsked({ kind: "answered", stats });
        }
      },
      () => {
        // What went wrong is the server's business and is in its log. A card
        // that printed a status at a reader would be telling them about a
        // route they did not ask about.
        if (live.current && mine === attempt.current) setAsked({ kind: "failed" });
      },
    );
  };

  useEffect(() => {
    // Set on the way in, not only cleared on the way out: an effect that runs
    // twice — which is what a development double render does — would otherwise
    // come back with this already false and never show an answer.
    live.current = true;
    ask();
    return () => {
      live.current = false;
    };
    // Arrival only. Naming the transport here would ask again on every redraw
    // of the page, which is one request per card per keystroke anywhere on it.
  }, []);

  return (
    <section
      className="perch-widget"
      style={spanStyle(card)}
      {...(asked.kind === "asking" ? { "aria-busy": true } : {})}
    >
      {asked.kind === "asking" ? (
        <div className={stat({ state: "waiting" }).root}>
          <span className="perch-visually-hidden">Loading</span>
        </div>
      ) : asked.kind === "failed" ? (
        // In its own box, which is the point: the others are still filling in
        // while this one says so.
        <div className={stat({ state: "failed" }).root} role="alert">
          <span>That did not load.</span>
          <button type="button" className="perch-button" onClick={ask}>
            Try again
          </button>
        </div>
      ) : (
        asked.stats.map((one, at) => (
          <StatCard key={`${one.label}-${String(at)}`} card={one} />
        ))
      )}
    </section>
  );
}

/**
 * How many columns this card asks for, as a variable the stylesheet reads.
 *
 * A count is an open number, so it cannot be a class; and set as `grid-column`
 * straight onto the element it would be an inline style, which the narrow
 * layout could then only beat with `!important`. As a custom property the
 * stylesheet stays in charge: the one-column breakpoint sets `grid-column`
 * itself and simply stops reading this.
 *
 * The same shape a layout's own column count already travels in.
 */
function spanStyle(card: WidgetCard): Record<string, string> | undefined {
  if (card.columnSpan === undefined) return undefined;
  return { "--perch-widget-span": String(card.columnSpan) };
}

/**
 * The tones a card may carry, which are the ones an entry may.
 *
 * A tuple rather than a set, so that finding a name in it narrows to the name:
 * the recipe's own type takes the four and refuses a string, which is the
 * closed vocabulary being held by the compiler instead of by a rule that
 * matches an attribute or quietly does not.
 */
const TONES = ["neutral", "success", "warning", "danger"] as const;

function StatCard({ card }: { readonly card: StatNode }): ReactNode {
  // A variant now rather than an attribute a rule has to match. A name
  // outside the four is dropped and the card draws without one, which is what
  // the panel did before and is now also what it is able to do.
  const tone = TONES.find((one) => one === card.tone);
  const classes = stat(tone === undefined ? {} : { tone });

  return (
    <div className={classes.root}>
      <div className={classes.head}>
        <span className={classes.label}>{card.label}</span>
        {card.icon === undefined ? null : (
          <IconMark name={card.icon} className={classes.icon} />
        )}
      </div>

      <strong className={classes.value}>{reads(card)}</strong>

      {card.description === undefined ? null : (
        <div className={classes.description}>
          {card.descriptionIcon === undefined ? null : (
            <IconMark name={card.descriptionIcon} className={classes.trend} />
          )}
          <span>{card.description}</span>
        </div>
      )}
    </div>
  );
}

/**
 * What the card says, formatted where the locale is.
 *
 * A dash for nothing rather than a nought, because that is what the aggregate
 * meant: an empty set has no average, and a nought would be an answer.
 */
function reads(stat: StatNode): string {
  const value = stat.value;
  if (value === null) return "—";

  // Neither a number nor text. A `Stat` may hold a `Date`, because a minimum
  // over a timestamp column is one, but a card carrying one is refused where
  // the card is answered — and JSON has no date to send anyway. So this is the
  // branch the type leaves open and the wire never takes.
  if (typeof value !== "number" && typeof value !== "string") return String(value);

  if (stat.format === "money") {
    return formatted(value, {
      style: "currency",
      // An absent currency is a declaration half made. Formatting without one
      // throws, so it falls through to the digits rather than taking the card
      // down over a missing word.
      currency: stat.currency ?? "",
    });
  }

  if (stat.format === "numeric") {
    return formatted(value, {
      ...(stat.decimals === undefined
        ? {}
        : {
            minimumFractionDigits: stat.decimals,
            maximumFractionDigits: stat.decimals,
          }),
    });
  }

  return String(value);
}

/**
 * Formatted, or the digits as they came.
 *
 * Two ways this is asked to format something it cannot. A currency code that
 * is not one throws, and so does a fraction count outside what Intl allows —
 * both arrive from a declaration nothing validated. And a value that is a
 * string is a `Decimal` or a `BigInt`, which is why it is a string at all:
 * neither survives a double, so it is handed over as digits rather than
 * converted on the way.
 */
function formatted(value: number | string, options: Intl.NumberFormatOptions): string {
  try {
    const formatter = new Intl.NumberFormat(undefined, options);
    if (typeof value === "number") return formatter.format(value);
    const digits = asLiteral(value);
    return digits === undefined ? value : formatter.format(digits);
  } catch {
    return String(value);
  }
}

/** A string Intl will read as a number, which a decimal column answers with. */
function asLiteral(value: string): Intl.StringNumericLiteral | undefined {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value)
    ? (value as Intl.StringNumericLiteral)
    : undefined;
}
