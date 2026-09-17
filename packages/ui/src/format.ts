/**
 * A declared format, applied where the locale is known.
 *
 * The rule is the server's and the locale is the reader's, which is the whole
 * reason this runs here. Which zone a timestamp is read in and which currency
 * an amount is are decisions somebody made once and sent; how a date reads and
 * where the thousands separator goes is the browser's to answer, and it
 * answers differently for two readers looking at one response.
 *
 * Shared by the infolist's text entry and the table's text column, because it
 * is one question. A second copy would be a second answer, and a panel where
 * a date reads one way on a record and another in the list of them.
 */
export type ValueFormat = "dateTime" | "money" | "numeric";

export interface FormatRule {
  readonly format?: string;
  readonly timezone?: string;
  readonly currency?: string;
  readonly decimals?: number;
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

/**
 * The value as the rule asks for it, or nothing at all.
 *
 * Nothing rather than a guess: a value that is not a date under a rule that
 * says date is a value the caller should show as it stands. Falling back to
 * the raw value here would hide the mistake in the one place somebody could
 * have seen it.
 */
export function formatValue(value: unknown, rule: FormatRule): string | undefined {
  const { format, timezone, currency, decimals } = rule;

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
    // worth showing, and one cell may not take the page with it.
    return undefined;
  }

  return undefined;
}
