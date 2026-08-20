/**
 * Turning what a reader ticked into rows the server may act on.
 *
 * The client sends identifiers — what it ticked, not a description of it — so
 * the server acts on exactly the rows that were on screen. A filter sent
 * instead would be re-run here and would sweep up whatever matched by then,
 * including rows nobody had ever seen.
 *
 * They are loaded in one query. Fifty ticked rows are not fifty round trips.
 */
import type { DataAdapter, DeletedRows, Id, Row } from "@perchjs/core";
import { UnprocessableEntityException } from "@nestjs/common";
import { recordId } from "./record-id.js";

/**
 * How many rows one request may name.
 *
 * Above this the request is refused rather than trimmed: a reader who ticked
 * more than this and got a cheerful count for part of it would have no way to
 * learn which part. The acceptance criterion asks for 500 to work, and this
 * leaves room above it without letting a body grow without bound.
 */
export const MAX_SELECTION = 1000;

export interface Selection {
  /** Deduplicated, in the order they arrived. */
  readonly keys: readonly Id[];
}

/**
 * Reads `{ id }` or `{ ids: [...] }`. One is a selection of one, which is why
 * they go down the same path from here on.
 *
 * An identifier of a shape the key cannot be is dropped rather than refused:
 * the request is still about the rows it named properly, and a selection that
 * ends up naming nothing is answered by the caller.
 */
export function readSelection(
  data: DataAdapter,
  model: string,
  body: unknown,
): Selection {
  const raw = (body as { id?: unknown; ids?: unknown } | null) ?? {};
  const given = Array.isArray(raw.ids) ? raw.ids : raw.id === undefined ? [] : [raw.id];

  if (given.length > MAX_SELECTION) {
    throw new UnprocessableEntityException(
      `That selection names ${String(given.length)} records, and the limit is ` +
        `${String(MAX_SELECTION)}.`,
    );
  }

  const keys: Id[] = [];
  const seen = new Set<string>();
  for (const value of given) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const key = recordId(data, model, value);
    if (key === null) continue;
    // Two ticks of one row are one row. Left in, the count would say two.
    const token = String(key);
    if (seen.has(token)) continue;
    seen.add(token);
    keys.push(key);
  }
  return { keys };
}

/**
 * The rows those keys name, in one query.
 *
 * A key naming nothing comes back missing rather than as an error: the row may
 * have been deleted between the tick and the press, and the honest answer is a
 * count of what was actually there.
 */
export async function loadSelection(
  data: DataAdapter,
  model: string,
  keys: readonly Id[],
  deleted: DeletedRows = "without",
): Promise<readonly Row[]> {
  if (keys.length === 0) return [];

  const page = await data.findMany({
    model,
    clauses: [{ path: data.meta(model).primaryKey.name, operator: "in", value: keys }],
    take: keys.length,
    deleted,
  });
  return page.rows;
}
