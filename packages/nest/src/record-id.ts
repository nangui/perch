/**
 * A row id, as the adapter expects it.
 *
 * One arrives from a URL segment and is always a string; another arrives in a
 * JSON body and keeps whatever type it was sent as. An adapter that compares
 * strictly — which a typed client does — finds the row for one and not the
 * other, so the panel settles the type here, from what the model says its key
 * is.
 *
 * `null` means no row can have that key. The caller answers 404, the same as
 * for a row that is simply absent: handing the adapter a malformed key would
 * raise instead, and a 500 where a 404 belongs tells a caller that the key it
 * guessed was the wrong *shape* rather than the wrong value.
 */
import type { DataAdapter, Id, ScalarType } from "@perchjs/core";

const INTEGER = new Set<ScalarType>(["Int", "BigInt"]);
const FRACTIONAL = new Set<ScalarType>(["Float", "Decimal"]);

export function recordId(
  data: DataAdapter,
  model: string,
  raw: string | number,
): Id | null {
  const type = data.meta(model).primaryKey.type;
  if (!INTEGER.has(type) && !FRACTIONAL.has(type)) {
    const key = String(raw);
    return key === "" ? null : key;
  }

  // `Number("")` and `Number(" ")` are 0, which would quietly look up row zero.
  if (typeof raw === "string" && raw.trim() === "") return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return INTEGER.has(type) && !Number.isInteger(value) ? null : value;
}
