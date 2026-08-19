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

export function TextEntry(props: TextEntryProps): ReactNode {
  const shown = formatted(props) ?? plain(props.value);
  const empty = shown === undefined;
  const text = shown ?? props.placeholder ?? "—";
  // Unknown names fall back rather than becoming a class the stylesheet has not
  // got: a pill with no background reads as a rendering fault.
  const tone =
    props.tone !== undefined && TONES.has(props.tone) ? props.tone : undefined;

  // Nothing there is nothing to badge. A pill around an em dash draws the eye
  // to the one place on the page with the least in it.
  if (props.badge === true && !empty) {
    return (
      <p className="perch-entry" id={props.describedBy} data-empty="false">
        <span className={`perch-badge perch-badge--${tone ?? "neutral"}`}>{text}</span>
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
    >
      {text}
    </p>
  );
}
