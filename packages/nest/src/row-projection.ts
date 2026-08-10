/**
 * What a row is allowed to carry to a client.
 *
 * Every route that answers with row data goes through here, reads and writes
 * alike — which is why it is not in `records-query.ts`, whose subject is a
 * query string arriving.
 *
 * The rule is the one `serialise.ts` states for a form and this repository had
 * to learn twice for a row: hiding on the client is a leak, and what the client
 * never receives cannot leak. A row is rebuilt from the keys that were
 * declared, never filtered on arrival.
 */
import type { Ir, Row, Table } from "@perchjs/core";
import { findModel } from "@perchjs/core";

/**
 * The row keys a client may receive: the ones its columns name, and the key it
 * addresses rows by.
 *
 * Top-level segments, so `author.name` keeps `author`. Relations are not loaded
 * at all yet — `include` waits on the same declaration — so today that segment
 * is simply absent from the row; when it arrives, the whole related object goes
 * with it and cutting *that* down is its own piece of work.
 *
 * Without a table the default is the pair the sort allowlist already uses: the
 * key, and the label a human reads the row by. Declaring a table widens both,
 * and nothing else does.
 */
export function visibleKeys(
  model: string,
  ir: Ir,
  table: Table | undefined,
): ReadonlySet<string> {
  const meta = findModel(ir, model);
  const key = meta?.primaryKey.name;

  if (table === undefined) {
    return new Set([key, meta?.labelField].filter((n): n is string => n !== undefined));
  }
  const declared = table.state.columns.map((c) => head(c.state.path));
  return new Set([...declared, key].filter((n): n is string => n !== undefined));
}

/** Nothing else crosses. A row is rebuilt, never merely hidden. */
export function project(
  rows: readonly Row[],
  keys: ReadonlySet<string>,
): readonly Row[] {
  return rows.map((row) => projectOne(row, keys));
}

export function projectOne(row: Row, keys: ReadonlySet<string>): Row {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in row) out[key] = row[key];
  return out;
}

function head(path: string): string {
  return path.split(".")[0] ?? path;
}
