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
import type { ValueRefusal } from "./field.js";
import { acceptsClientState, Field } from "./field.js";
import type { FormState, ResolveResult } from "./resolve.js";

export type RejectionReason =
  | "unknown-path"
  | "invisible"
  | "disabled"
  | "read-only"
  /** A field of a kind no client ever sets, whatever its flags resolved to. */
  | "server-owned"
  /** `wrong-shape`, `undeclared-value` — what the field itself turned away. */
  | ValueRefusal;

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
  // Keyed by where the value lives, not by what the field is called: the same
  // declaration stands for a field in every row of a repeater, and only the
  // path tells those apart.
  const fields = new Map(
    previous.nodes
      .filter((node) => node.component instanceof Field && node.path !== "")
      .map((node) => [node.path, node]),
  );

  const state: Record<string, unknown> = {};
  const rejected: RejectedPath[] = [];

  for (const [path, value] of Object.entries(incoming)) {
    const node = fields.get(path);
    if (node === undefined) {
      rejected.push({ path, reason: "unknown-path" });
      continue;
    }
    // Asked of the kind of field before its flags, because a resolvable flag
    // is a lock whose key the form holds.
    if (!(node.component as Field).acceptsClient) {
      rejected.push({ path, reason: "server-owned" });
      continue;
    }
    if (!acceptsClientState(node)) {
      rejected.push({ path, reason: reasonFor(node) });
      continue;
    }
    // The value, put to the field rather than judged from here: what a field
    // can hold is the field's own answer, and a chain of `instanceof` in this
    // file would have to grow with every type added and remind nobody.
    const wrong = (node.component as Field).admits(value, node.options);
    if (wrong !== undefined) {
      rejected.push({ path, reason: wrong });
      continue;
    }
    state[path] = value;
  }

  return { state, rejected };
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
