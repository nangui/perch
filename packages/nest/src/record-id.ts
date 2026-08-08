/**
 * A row id, as the adapter expects it.
 *
 * One arrives from a URL segment and is always a string; another arrives in a
 * JSON body and keeps whatever type it was sent as. An adapter that compares
 * strictly — which a typed client does — finds the row for one and not the
 * other, so the panel settles the type here, from what the model says its key
 * is.
 */
import type { DataAdapter, Id } from "@perchjs/core";

const NUMERIC = new Set(["Int", "Float", "Decimal", "BigInt"]);

export function recordId(data: DataAdapter, model: string, raw: string | number): Id {
  const type = data.meta(model).primaryKey.type;
  if (!NUMERIC.has(type)) return String(raw);

  const value = Number(raw);
  // A key that is not the number it claims to be matches no row; saying so with
  // a NaN would push the question onto the adapter.
  return Number.isFinite(value) ? value : String(raw);
}
