/**
 * What a resource lets this principal do.
 *
 * A refusal is a 404, never a 403: telling the two apart is how a caller maps
 * what exists. And a check that cannot be evaluated is a refusal too — skipping
 * a declared one because the record is not loaded yet would be authorising at
 * render time, which is the one thing authorisation may not do.
 */
import type { Operation } from "@perchjs/core";

export interface Authorization<TUser = unknown, TRecord = unknown> {
  /** Gates the resource itself: its routes and its navigation entry alike. */
  readonly viewAny?: (user: TUser) => boolean | Promise<boolean>;
  readonly view?: (user: TUser, record: TRecord) => boolean | Promise<boolean>;
  readonly create?: (user: TUser) => boolean | Promise<boolean>;
  readonly update?: (user: TUser, record: TRecord) => boolean | Promise<boolean>;
  readonly delete?: (user: TUser) => boolean | Promise<boolean>;
}

/**
 * `needs-record` is refused like a denial. It is kept apart from `denied` so the
 * server log can say which of the two happened; the caller is told neither.
 */
export type Verdict = "allowed" | "denied" | "needs-record";

/**
 * Absent means allowed — the panel already sits behind the guards. It is the
 * debatable half of this design and it is the documented one.
 */
export async function authorize(
  can: Authorization | undefined,
  operation: Operation,
  user: unknown,
): Promise<Verdict> {
  if (can === undefined) return "allowed";

  if (can.viewAny !== undefined && !(await can.viewAny(user))) return "denied";

  switch (operation) {
    case "create":
      if (can.create === undefined) return "allowed";
      return (await can.create(user)) ? "allowed" : "denied";
    case "edit":
      return can.update === undefined ? "allowed" : "needs-record";
    case "view":
      return can.view === undefined ? "allowed" : "needs-record";
  }
}

/** The gate on the resource as a whole, with no operation in hand. */
export async function mayReach(
  can: Authorization | undefined,
  user: unknown,
): Promise<boolean> {
  if (can?.viewAny === undefined) return true;
  return await can.viewAny(user);
}
