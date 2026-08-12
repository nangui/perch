/**
 * Stage 5 — the trust boundary.
 *
 * Incoming state is replayed against the tree the server last resolved: an
 * unknown path, or one belonging to a field that is invisible, disabled or
 * read-only, is dropped. Silently. A message naming the reason tells an
 * attacker which fields exist and which are protected.
 *
 * It runs before the resolution cycle, against the *previous* result, because
 * that is the last thing the server itself asserted about the form. Deciding
 * from the incoming state would be asking the attacker to mark their own work.
 */
import { acceptsClientState, Field } from "./field.js";
import { Checkbox } from "./fields/checkbox.js";
import { Select } from "./fields/select.js";
import type { FormState, ResolvedNode, ResolveResult } from "./resolve.js";

export type RejectionReason =
  | "unknown-path"
  | "invisible"
  | "disabled"
  | "read-only"
  /** An object, or a list where the field holds one value — or the reverse. */
  | "wrong-shape"
  /** A value the declaration never named. */
  | "undeclared-value";

export interface RejectedPath {
  readonly path: string;
  readonly reason: RejectionReason;
}

export interface SanitizeResult {
  readonly state: FormState;
  /** For the server log only. Never reaches the response. */
  readonly rejected: readonly RejectedPath[];
}

export function sanitize(previous: ResolveResult, incoming: FormState): SanitizeResult {
  const fields = new Map(
    previous.nodes
      .filter((node) => node.component instanceof Field)
      .map((node) => [(node.component as Field).name, node]),
  );

  const state: Record<string, unknown> = {};
  const rejected: RejectedPath[] = [];

  for (const [path, value] of Object.entries(incoming)) {
    const node = fields.get(path);
    if (node === undefined) {
      rejected.push({ path, reason: "unknown-path" });
      continue;
    }
    if (!acceptsClientState(node)) {
      rejected.push({ path, reason: reasonFor(node) });
      continue;
    }
    const wrong = refuse(node, value);
    if (wrong !== undefined) {
      rejected.push({ path, reason: wrong });
      continue;
    }
    state[path] = value;
  }

  return { state, rejected };
}

/**
 * What the value itself disqualifies it for, if anything.
 *
 * Until now this boundary asked only whose the path was, never what it
 * carried, so a client could write any shape and any value into any field it
 * was allowed to touch at all.
 */
function refuse(node: ResolvedNode, value: unknown): RejectionReason | undefined {
  const field = node.component;
  // A select is the only field that holds several so far. A `Repeater` or a
  // `KeyValue` holds a shape this would refuse, and each will have to say so
  // here before it can be written to.
  //
  // Two `instanceof` now. A third means this belongs on the field itself,
  // asked rather than decided from outside.
  const list = field instanceof Select && field.state.multiple;

  // Clearing a field is a choice like any other, and the empty forms are the
  // only ones no declaration ever names.
  if (isEmpty(value, list)) return undefined;

  if (Array.isArray(value) !== list) return "wrong-shape";

  // A box is ticked or it is not. `"yes"` passes for a scalar and reaches a
  // boolean column as text.
  if (field instanceof Checkbox && typeof value !== "boolean") return "wrong-shape";

  const held = list ? (value as readonly unknown[]) : [value];
  if (held.some((one) => !isScalar(one))) return "wrong-shape";

  // A declared list is the closed set, and this is where it closes. A relation
  // is not: its options are a window onto a table, and the value being edited
  // may sit outside it — which is what the foreign key is for.
  if (!(field instanceof Select) || field.state.relationship !== undefined)
    return undefined;
  // Nothing declared means nothing is legal, not everything. A select with
  // neither options nor a relation is a mistake, and being lenient about it
  // would make the mistake into a way in.
  const declared = node.options ?? [];

  // Matched as text, because a form returns `"2"` for a key declared as `2`.
  const names = new Set(declared.map((option) => String(option.value)));
  return held.every((one) => names.has(String(one))) ? undefined : "undeclared-value";
}

/** Empty is nothing, blank text, or — for a field that holds several — none. */
function isEmpty(value: unknown, list: boolean): boolean {
  if (value === undefined || value === null || value === "") return true;
  return list && Array.isArray(value) && value.length === 0;
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  );
}

function reasonFor(node: {
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
}): RejectionReason {
  if (!node.visible) return "invisible";
  if (node.disabled) return "disabled";
  return "read-only";
}
