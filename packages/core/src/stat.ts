/**
 * One number on a card, with what a reader needs to read it.
 *
 * Built where the numbers are worked out, which is per request rather than at
 * boot: a widget's `stats()` runs when somebody asks for it, so unlike a
 * column or an entry there is no declaration sitting still for the boot to
 * inspect. What can go wrong with one is therefore checked when it is
 * answered, and a card that cannot be drawn is that card's failure.
 *
 * Immutable and fluent like every other builder here. One shared between
 * requests leaks one reader's numbers into another's, which is not a matter of
 * style.
 */
import type { AggregateValue } from "./data-adapter.js";
import type { EntryTone } from "./entries/text-entry.js";
import type { IconName } from "./icon.js";

export interface StatState {
  /** What the card is called. Static: there is one card, not one per row. */
  readonly label: string;
  /**
   * What it says, in the shapes an aggregate answers.
   *
   * The same three, because a stat is usually an aggregate's answer and
   * because they are the three that survive `JSON.stringify`. A host handing
   * back anything else is told so rather than taking the page down.
   */
  readonly value: AggregateValue;
  /** The quieter line under it: a comparison, a period, a share. */
  readonly description?: string;
  readonly icon?: IconName;
  /** An icon on the description, which is where a trend arrow goes. */
  readonly descriptionIcon?: IconName;
  /**
   * Which tone the card carries.
   *
   * A fixed one, not a choice read from a value: the value is already in hand
   * by the time a stat is built, so a function would be asked about what the
   * caller just decided.
   */
  readonly tone?: EntryTone;
  /** How the value reads. Applied in the browser, where the locale is. */
  readonly format?: "money" | "numeric";
  readonly currency?: string;
  readonly decimals?: number;
}

export class Stat {
  readonly state: StatState;

  private constructor(state: StatState) {
    this.state = state;
  }

  /** The label and the number, which are the two a card cannot do without. */
  static make(label: string, value: AggregateValue): Stat {
    return new Stat({ label, value });
  }

  private with(state: StatState): Stat {
    return new Stat(state);
  }

  description(text: string): Stat {
    return this.with({ ...this.state, description: text });
  }

  icon(name: IconName): Stat {
    return this.with({ ...this.state, icon: name });
  }

  descriptionIcon(name: IconName): Stat {
    return this.with({ ...this.state, descriptionIcon: name });
  }

  /** Named `color` for the reason a column's is: it is what an author says. */
  color(tone: EntryTone): Stat {
    return this.with({ ...this.state, tone });
  }

  money(currency: string): Stat {
    return this.with({ ...this.state, format: "money", currency });
  }

  numeric(decimals?: number): Stat {
    return this.with({
      ...this.state,
      format: "numeric",
      ...(decimals === undefined ? {} : { decimals }),
    });
  }
}

/** What crosses the wire for one card. */
export interface StatNode {
  readonly label: string;
  readonly value: AggregateValue;
  readonly description?: string;
  readonly icon?: string;
  readonly descriptionIcon?: string;
  readonly tone?: string;
  readonly format?: string;
  readonly currency?: string;
  readonly decimals?: number;
}

/** The cards, as the client gets them. No key is copied that was not set. */
export function serialiseStats(stats: readonly Stat[]): readonly StatNode[] {
  return stats.map(({ state }) => ({
    label: state.label,
    value: state.value,
    ...(state.description === undefined ? {} : { description: state.description }),
    ...(state.icon === undefined ? {} : { icon: state.icon }),
    ...(state.descriptionIcon === undefined
      ? {}
      : { descriptionIcon: state.descriptionIcon }),
    ...(state.tone === undefined ? {} : { tone: state.tone }),
    ...(state.format === undefined ? {} : { format: state.format }),
    ...(state.currency === undefined ? {} : { currency: state.currency }),
    ...(state.decimals === undefined ? {} : { decimals: state.decimals }),
  }));
}
