/**
 * `TextEntry` — a value from the record, read.
 *
 * Not a control and not shaped like one. A field's box says "this is yours to
 * change"; there is nothing to change here, so the value is set as text and the
 * label above it does the work a legend does.
 *
 * The formatting rule comes from the server and the locale from the browser.
 * Which zone a timestamp is read in and which currency an amount is are
 * declarations somebody made; how a date reads is the reader's own, and their
 * browser is the only thing that knows it.
 *
 * Nothing here throws. An unknown timezone, a date that will not parse, a
 * number that is a string — each falls back to the plain value rather than
 * taking the page down over one entry.
 */
import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton.js";

export interface TextEntryProps {
  /** Whatever the record held. Absent, null and empty all read as nothing. */
  readonly value?: unknown;
  /** Shown in place of nothing, so a blank line is never left to be read. */
  readonly placeholder?: string;
  /** How to present it, as the server declared it. */
  readonly format?: string;
  readonly timezone?: string;
  readonly currency?: string;
  readonly decimals?: number;
  /** Drawn as a pill rather than as a line of text. */
  readonly badge?: boolean;
  /** Which of the panel's colours, already chosen by the server. */
  readonly tone?: string;
  /** Where it links to, already built and already checked by the server. */
  readonly href?: string;
  /** A button beside it that copies the whole value, not the shown one. */
  readonly copyable?: boolean;
  /** What the entry is called, which is what names the copy button. */
  readonly label?: string;
  /** How much to show. The rest is still there to hover over and to copy. */
  readonly limit?: number;
  /** Points the shell's help line at this, so the two are read together. */
  readonly describedBy: string;
}

/** Anything the wire can carry, as one line. Objects are nobody's to guess at. */
function plain(value: unknown): string | undefined {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** A number, or nothing. A numeric string counts: JSON carries some that way. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function dateOf(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatted(props: TextEntryProps): string | undefined {
  const { value, format, timezone, currency, decimals } = props;

  try {
    if (format === "dateTime") {
      const date = dateOf(value);
      if (date === undefined) return undefined;
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timezone === undefined ? {} : { timeZone: timezone }),
      }).format(date);
    }

    if (format === "money") {
      const amount = numberOf(value);
      if (amount === undefined || currency === undefined) return undefined;
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
        amount,
      );
    }

    if (format === "numeric") {
      const amount = numberOf(value);
      if (amount === undefined) return undefined;
      return new Intl.NumberFormat(undefined, {
        ...(decimals === undefined
          ? {}
          : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
      }).format(amount);
    }
  } catch {
    // A zone or a currency code the runtime does not know. The value is still
    // worth showing, and one entry may not take the page with it.
    return undefined;
  }

  return undefined;
}

/** Only the ones the stylesheet has. An unknown name is not a colour. */
const TONES = new Set(["neutral", "success", "warning", "danger"]);

// Built once: a segmenter per render per entry is not free.
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The first `limit` characters, counted the way a reader counts them.
 *
 * Graphemes, not code units: a family emoji is seven code points, and a cut
 * through one leaves a box on the page. The same count `.maxLength()` uses.
 */
function shorten(text: string, limit: number): string {
  if (limit <= 0) return text;
  const kept: string[] = [];
  for (const { segment } of GRAPHEMES.segment(text)) {
    if (kept.length === limit) return `${kept.join("")}\u2026`;
    kept.push(segment);
  }
  return text;
}

export function TextEntry(props: TextEntryProps): ReactNode {
  const shown = formatted(props) ?? plain(props.value);
  const empty = shown === undefined;
  const whole = shown ?? props.placeholder ?? "—";
  const text = props.limit === undefined || empty ? whole : shorten(whole, props.limit);
  const cut = text !== whole;

  // The whole value, never the shortened one: copying an ellipsis is worse than
  // having no button.
  const copy =
    props.copyable === true && !empty ? (
      <CopyButton
        value={whole}
        {...(props.label === undefined ? {} : { label: props.label })}
      />
    ) : null;
  // Unknown names fall back rather than becoming a class the stylesheet has not
  // got: a pill with no background reads as a rendering fault.
  const tone =
    props.tone !== undefined && TONES.has(props.tone) ? props.tone : undefined;

  // Linked or not, the same text: the address was built and checked on the
  // server, and an entry with none is words.
  const body =
    props.href === undefined || empty ? (
      text
    ) : (
      <a className="perch-entry__link" href={props.href} rel="noreferrer">
        {text}
      </a>
    );

  // Nothing there is nothing to badge. A pill around an em dash draws the eye
  // to the one place on the page with the least in it.
  if (props.badge === true && !empty) {
    return (
      <p className="perch-entry" id={props.describedBy} data-empty="false">
        <span className={`perch-badge perch-badge--${tone ?? "neutral"}`}>{body}</span>
        {copy}
      </p>
    );
  }

  // A colour with no pill colours the words. The two are separate options and
  // a tone that drew nothing without the other would be a declaration nothing
  // acts on — which is what this codebase spends most of its guards catching.
  return (
    <p
      className="perch-entry"
      id={props.describedBy}
      data-empty={empty}
      {...(tone === undefined || empty ? {} : { "data-tone": tone })}
      {...(cut ? { title: whole } : {})}
    >
      {body}
      {copy}
    </p>
  );
}
