/**
 * The state vocabulary every field shares.
 *
 * The eight states of the source design are not eight independent booleans: they
 * are one lifecycle plus two orthogonal facts. Modelling it that way is what
 * makes "rest + error + in flight" impossible to express by accident, and what
 * lets every field render the same status marks without repeating the logic.
 *
 * The lifecycle maps onto the three ownership zones of ARCH 13 §3:
 *   rest / invalid  →  canonical, owned by the server
 *   draft           →  draft, owned by the client and never overwritten
 *   inFlight        →  a patch is on the wire; still editable
 *   loading         →  the server is computing this field's own value or options
 */

export type FieldLifecycle =
  /** Showing the server's value, nothing pending. */
  | "rest"
  /** The user has typed; the patch has not been sent yet. */
  | "draft"
  /** A patch is on the wire. Editable throughout — a keystroke cancels it. */
  | "inFlight"
  /** This field's value or options are being fetched. */
  | "loading";

export interface FieldStatus {
  readonly lifecycle: FieldLifecycle;
  /** Server-side validation message. Rendered on the reserved help line. */
  readonly error?: string | undefined;
  /** The server forbids editing right now — the value stays readable. */
  readonly disabled?: boolean | undefined;
  /** Another system owns the value. Selectable and copyable, never an input. */
  readonly readOnly?: boolean | undefined;
}

export const REST: FieldStatus = { lifecycle: "rest" };

/**
 * Attributes the CSS keys off. Kept in one place so a new field type cannot
 * invent its own spelling of `data-invalid`.
 */
export interface StatusAttributes {
  readonly "data-state": FieldLifecycle;
  readonly "data-invalid": "true" | "false";
  readonly "data-disabled": "true" | "false";
  readonly "data-readonly": "true" | "false";
}

export function statusAttributes(status: FieldStatus): StatusAttributes {
  return {
    "data-state": status.lifecycle,
    "data-invalid": status.error === undefined ? "false" : "true",
    "data-disabled": status.disabled === true ? "true" : "false",
    "data-readonly": status.readOnly === true ? "true" : "false",
  };
}

/** True when the control must not accept input, for whichever reason. */
export function isLocked(status: FieldStatus): boolean {
  return status.disabled === true || status.readOnly === true;
}

/**
 * The debounce a field type owes the transport, in milliseconds (ARCH 13 §5).
 * Text waits; anything discrete commits at once. A field never picks its own
 * timing — that is how a form ends up with four different feels.
 */
export const DEBOUNCE_MS = {
  text: 400,
  immediate: 0,
} as const;

export type FieldKindForDebounce =
  "text" | "textarea" | "code" | "select" | "toggle" | "date";

export function debounceFor(kind: FieldKindForDebounce): number {
  return kind === "text" || kind === "textarea" || kind === "code"
    ? DEBOUNCE_MS.text
    : DEBOUNCE_MS.immediate;
}
