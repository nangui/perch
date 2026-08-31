/**
 * What a reader arranged, kept between visits.
 *
 * Which columns they took off and how many rows they asked for. Both are about
 * how a table is read rather than about what it holds, so nothing here ever
 * decides which rows come back — a column left off a page is still a column
 * whose values the server sent and the policy allowed.
 *
 * Kept in the browser rather than in the address or on the server, which is a
 * trade rather than an obvious answer. The address would put the arrangement in
 * a link and hand somebody else's columns to whoever opened it, and it is lost
 * the moment a reader reaches the table through the navigation instead. The
 * server would follow a person from one machine to another, and needs a store
 * this framework does not have and should not grow without deciding to. So:
 * per browser, which is what "per user" means in an admin panel most of the
 * time, and what it does not mean on a shared machine — the last person to
 * arrange a table there is the one whose arrangement the next one finds.
 *
 * Everything here fails quietly. Storage is refused in private windows, full on
 * some phones, and absent while rendering on a server; none of that is worth a
 * broken table, and the cost of forgetting is that a reader arranges it again.
 */

/** One table's arrangement, as it is written down. */
export interface Arrangement {
  readonly hidden?: readonly string[];
  readonly perPage?: number;
}

const PREFIX = "perch.table.";

/**
 * Keyed by the table's own address.
 *
 * Two resources arrange independently, and the same resource is the same table
 * whichever page of it a reader is on. A table with no address — a relation
 * manager's, drawn under a record — is not remembered at all rather than
 * sharing a key with another: an arrangement that leaked between tabs would be
 * worse than one that is forgotten.
 */
function keyFor(table: string | undefined): string | undefined {
  return table === undefined || table === "" ? undefined : `${PREFIX}${table}`;
}

function store(): Storage | undefined {
  try {
    // Touched rather than trusted: Safari's private mode has the object and
    // throws on write, so the only honest test is a write.
    const held = globalThis.localStorage;
    const probe = `${PREFIX}probe`;
    held.setItem(probe, "1");
    held.removeItem(probe);
    return held;
  } catch {
    return undefined;
  }
}

/** What was kept for this table, or nothing at all. */
export function remembered(table: string | undefined): Arrangement {
  const key = keyFor(table);
  const held = key === undefined ? undefined : store();
  if (key === undefined || held === undefined) return {};

  try {
    const raw = held.getItem(key);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const { hidden, perPage } = parsed as Record<string, unknown>;
    return {
      // Read defensively, because what is in storage was written by an older
      // version of this file as readily as by this one.
      ...(Array.isArray(hidden)
        ? { hidden: hidden.filter((one): one is string => typeof one === "string") }
        : {}),
      ...(typeof perPage === "number" && Number.isInteger(perPage) && perPage > 0
        ? { perPage }
        : {}),
    };
  } catch {
    return {};
  }
}

/** Writes one part of it, leaving the rest as it was. */
export function remember(table: string | undefined, part: Arrangement): void {
  const key = keyFor(table);
  const held = key === undefined ? undefined : store();
  if (key === undefined || held === undefined) return;

  try {
    held.setItem(key, JSON.stringify({ ...remembered(table), ...part }));
  } catch {
    // Full, or refused. A table that draws is worth more than one that is
    // remembered, and the reader arranges it again.
  }
}
