/**
 * Wall clock ↔ instant, in a named zone.
 *
 * A column holds an instant; a form shows a wall clock. Everything hard about
 * dates lives in that sentence, and it is why the value a form carries here is
 * `2026-03-29T02:30` with no `Z` and no offset — a string that names what a
 * reader would see on their own wall, and nothing about where they are.
 *
 * There is no `Temporal` in this runtime, so the conversion is built on `Date`
 * and `Intl`. The offsets a day either side give the two instants a wall time
 * could name; which of them a reader would actually see is settled by
 * formatting each back and keeping the ones that say what was typed. Asked,
 * not derived — arithmetic around a shift is exactly where a plausible answer
 * and a true one part company.
 *
 * Two hours a year have no single answer and both are decided here rather than
 * left to whatever falls out:
 *
 *   - A wall time that happened twice takes the **first** of the two. The
 *     reader wrote a time that had already come once; taking the later one
 *     moves their appointment an hour into the future.
 *   - A wall time that never happened takes the instant it would have had. The
 *     clock skipped from 02:00 to 03:00, so 02:30 becomes 03:30 rather than an
 *     error about a time somebody's calendar showed them.
 */

/** `YYYY-MM-DD` and `HH:mm`, joined. What a form carries and a reader sees. */
export type WallClock = string;

const DAY = 86_400_000;

/**
 * The zone's offset from UTC at an instant, in milliseconds.
 *
 * Read by formatting the instant twice — once in the zone, once in UTC — and
 * taking the difference. `timeZoneName` would give a string to parse, and a
 * string to parse is a bug waiting for the one zone that writes it differently.
 */
function offsetAt(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const at = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour12: false` yields 24 for midnight in some engines; 24:00 is 00:00.
  const hour = at("hour") % 24;

  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    hour,
    at("minute"),
    at("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a wall clock names in a zone.
 *
 * Returns `undefined` for a string that is not a wall clock at all, which is
 * the boundary's business rather than this function's to complain about.
 */
export function toInstant(wall: WallClock, zone: string): Date | undefined {
  const asked = wall.length === 10 ? `${wall}T00:00` : wall;
  const naive = Date.parse(`${asked}:00Z`);
  if (Number.isNaN(naive)) return undefined;

  // A day either side, so both offsets around a shift are seen. Reading the
  // offset at the naive instant twice cannot do it: both readings land on the
  // same side of the shift and agree, and the other candidate is never made.
  const offsets = new Set([offsetAt(naive - DAY, zone), offsetAt(naive + DAY, zone)]);
  const candidates = [...offsets].map((offset) => naive - offset).sort((a, b) => a - b);

  const holds = candidates.filter(
    (instant) => toWallClock(new Date(instant), zone, true) === asked,
  );

  // One that holds is the ordinary case. Two: the wall time came round twice,
  // and the earlier is the one already past — taking the later moves a reader's
  // appointment an hour on. None: the clock skipped over it, and the later
  // candidate is the instant it skipped to, so 02:30 becomes 03:30 rather than
  // an error about a time somebody's calendar showed them.
  return new Date(holds[0] ?? Math.max(...candidates));
}

/** What a reader in that zone sees on their wall at that instant. */
export function toWallClock(instant: Date, zone: string, withTime: boolean): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).formatToParts(instant);

  const at = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${at("year")}-${at("month")}-${at("day")}`;
  if (!withTime) return date;

  // 24:00 is midnight of the same day, which some engines report for hour.
  const hour = String(Number(at("hour")) % 24).padStart(2, "0");
  return `${date}T${hour}:${at("minute")}`;
}

/** Whether a string is shaped like one, before anything tries to read it. */
export function isWallClock(value: unknown, withTime: boolean): value is WallClock {
  if (typeof value !== "string") return false;
  return withTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    : /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Whether a date names a day that exists.
 *
 * `Date.parse` rolls one that does not over rather than refusing it, so
 * `2026-02-30` is read as the 2nd of March and `2026-04-31` as the 1st of May —
 * quietly, with nothing downstream able to tell that the day it was handed is
 * not the day that was asked for.
 */
export function isRealDay(day: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (parts === null) return false;

  const made = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])),
  );
  return made.toISOString().slice(0, 10) === day;
}

/**
 * Whether a zone is one this runtime has heard of.
 *
 * `Intl` throws on a name it does not know rather than falling back, so an
 * unchecked zone is a request that returns a 500 — every request, once the
 * control is touched. Asked at boot instead, where a typo is a line to fix.
 */
export function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
