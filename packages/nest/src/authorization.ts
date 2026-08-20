/**
 * What a resource lets this principal do.
 *
 * A refusal is a 404, never a 403: telling the two apart is how a caller maps
 * what exists. And a check that cannot be evaluated is a refusal too — skipping
 * a declared one because the record is not loaded yet would be authorising at
 * render time, which is the one thing authorisation may not do.
 */
import type { Action, Operation, Row } from "@perchjs/core";
import { DeleteAction, ForceDeleteAction, RestoreAction } from "@perchjs/core";

export interface Authorization<TUser = unknown, TRecord = unknown> {
  /** Gates the resource itself: its routes and its navigation entry alike. */
  readonly viewAny?: (user: TUser) => boolean | Promise<boolean>;
  readonly view?: (user: TUser, record: TRecord) => boolean | Promise<boolean>;
  readonly create?: (user: TUser) => boolean | Promise<boolean>;
  readonly update?: (user: TUser, record: TRecord) => boolean | Promise<boolean>;
  readonly delete?: (user: TUser) => boolean | Promise<boolean>;
  /**
   * Lifting a mark, and destroying for good. Separate from `delete` and from
   * each other, because being allowed to hide a row is not being allowed to
   * bring one back, and neither is being allowed to leave nothing to bring.
   */
  readonly restore?: (user: TUser) => boolean | Promise<boolean>;
  readonly forceDelete?: (user: TUser) => boolean | Promise<boolean>;
  /**
   * Asking to see what was removed.
   *
   * Separate from `view`, which is about a row somebody can already reach. A
   * deleted row is off the page by default, and being allowed to read the page
   * is not the same as being allowed to read what was taken off it — a
   * cancelled order, a closed account, a name somebody asked to have removed.
   */
  readonly viewDeleted?: (user: TUser) => boolean | Promise<boolean>;
}

/**
 * `needs-record` is refused like a denial. It is kept apart from `denied` so the
 * server log can say which of the two happened; the caller is told neither.
 */
export type Verdict = "allowed" | "denied" | "needs-record";

/**
 * What may be asked of a resource.
 *
 * Wider than the form's `Operation` and deliberately kept apart from it:
 * deleting is not a form somebody fills, so widening the shared type would put
 * a case into the resolution cycle that can never happen there.
 */
export type Permission =
  Operation | "delete" | "restore" | "forceDelete" | "viewDeleted";

/**
 * Which policy an action is held to.
 *
 * Deleting asks the delete policy; everything else asks the one for changing a
 * row. Shared, because an action's schema is reachable by two routes and both
 * owe it the same question — a guard only one door goes through is decoration.
 */
export function permissionFor(action: Action): Permission {
  if (action instanceof ForceDeleteAction) return "forceDelete";
  if (action instanceof RestoreAction) return "restore";
  if (action instanceof DeleteAction) return "delete";
  return "edit";
}

/**
 * Absent means allowed — the panel already sits behind the guards. It is the
 * debatable half of this design and it is the documented one.
 */
export async function authorize(
  can: Authorization | undefined,
  operation: Permission,
  user: unknown,
  record?: Row,
): Promise<Verdict> {
  if (can === undefined) return "allowed";

  if (can.viewAny !== undefined && !(await can.viewAny(user))) return "denied";

  switch (operation) {
    case "create":
      if (can.create === undefined) return "allowed";
      return (await can.create(user)) ? "allowed" : "denied";
    case "edit":
      return await scoped(can.update, user, record);
    case "view":
      return await scoped(can.view, user, record);
    case "restore":
      if (can.restore === undefined) return "allowed";
      return (await can.restore(user)) ? "allowed" : "denied";
    case "viewDeleted":
      // Asked of the principal, never of a row: it decides which rows are read
      // at all, so there is none in hand to ask about.
      if (can.viewDeleted === undefined) return "allowed";
      return (await can.viewDeleted(user)) ? "allowed" : "denied";
    case "forceDelete":
      if (can.forceDelete === undefined) return "allowed";
      return (await can.forceDelete(user)) ? "allowed" : "denied";
    case "delete":
      // Asked of the principal rather than of a row, which is what the policy
      // declares. A rule that turns on which row is the action's own guard,
      // and that one is asked per record.
      if (can.delete === undefined) return "allowed";
      return (await can.delete(user)) ? "allowed" : "denied";
  }
}

async function scoped(
  check: ((user: unknown, record: unknown) => boolean | Promise<boolean>) | undefined,
  user: unknown,
  record: Row | undefined,
): Promise<Verdict> {
  if (check === undefined) return "allowed";
  if (record === undefined) return "needs-record";
  return (await check(user, record)) ? "allowed" : "denied";
}

/** The gate on the resource as a whole, with no operation in hand. */
export async function mayReach(
  can: Authorization | undefined,
  user: unknown,
): Promise<boolean> {
  if (can?.viewAny === undefined) return true;
  return await can.viewAny(user);
}
