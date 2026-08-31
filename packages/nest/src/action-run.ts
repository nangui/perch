/**
 * Carrying out an action, with no resource in it.
 *
 * Shared because a relation manager runs actions the same way a resource does —
 * the same allowlist read off the declaration, the same reload of what was
 * ticked, the same guard per record — and differs in one thing: which rows it
 * may reach at all. Two copies would drift, and the one that drifted would be
 * the one with the narrowing in it.
 */
import { NotFoundException } from "@nestjs/common";
import type {
  Action,
  DataAdapter,
  DeletedRows,
  FormState,
  Id,
  JoinNarrowing,
  NotificationState,
  Row,
  SchemaPayload,
  Table,
} from "@perchjs/core";
import {
  DeleteAction,
  DetachAction,
  actsOn,
  ForceDeleteAction,
  ReplicateAction,
  RestoreAction,
  SOFT_DELETE_FIELD,
  admittedRecords,
  declaredActions,
  runAction,
} from "@perchjs/core";
import { loadSelection, readSelection } from "./action-selection.js";
import type { Authorization } from "./authorization.js";
import { authorize, permissionFor } from "./authorization.js";

export interface ActionAnswer {
  /** How many records it ran against. */
  readonly processed: number;
  /** How many a guard turned down. Never why. */
  readonly refused: number;
  readonly notification?: NotificationState;
  /**
   * A modal whose form does not validate, answered the way a refused save is.
   *
   * Not a 4xx: the request was well formed and the reader is not done with the
   * dialog. The tree comes back with it so the errors land on the fields they
   * are about, rather than as a sentence about a form the client would have to
   * match up itself.
   */
  readonly errors?: Readonly<Record<string, string>>;
  readonly payload?: SchemaPayload;
}

/**
 * The rows of a selection that are this parent's, and no others.
 *
 * A column is compared against what is already in hand. A join is asked of the
 * database — one query for the whole selection, never one per row — because no
 * column on such a row says whose it is. What comes back is the intersection,
 * and what does not come back is dropped in silence: a row belonging to another
 * parent is not a row this caller was told about.
 */
async function narrowed(
  data: DataAdapter,
  model: string,
  loaded: readonly Row[],
  scope: ActionTarget["scope"],
): Promise<readonly Row[]> {
  if (scope === undefined) return loaded;
  if (scope.kind === "column") {
    return loaded.filter((row) => row[scope.column] === scope.value);
  }

  const key = data.meta(model).primaryKey.name;
  const keys = loaded
    .map((row) => row[key])
    .filter(
      (one): one is string | number =>
        typeof one === "string" || typeof one === "number",
    );
  if (keys.length === 0) return [];

  const page = await data.findMany({
    model,
    clauses: [{ path: key, operator: "in", value: keys }],
    joinedTo: scope.joinedTo,
    take: keys.length,
  });
  const joined = new Set(page.rows.map((row) => String(row[key])));
  return loaded.filter((row) => joined.has(String(row[key])));
}

export interface ActionTarget {
  readonly data: DataAdapter;
  /** Where the allowlist is read. No table declares no actions. */
  readonly table?: Table;
  /**
   * Already read off that table, where the caller had to look it up to know
   * which permission to ask. One lookup, so there is one answer.
   */
  readonly action?: Action;
  /** Whose rows are acted on. */
  readonly model: string;
  /** Asked per record, where a record is what decides it. */
  readonly can?: Authorization;
  /**
   * Rows outside it are not this caller's to act on.
   *
   * Derived by the server, never read from the body: a selection naming
   * somebody else's children is a selection of perfectly valid rows, and
   * nothing about the rows themselves would look wrong.
   */
  /**
   * What narrows the selection to one parent, when there is one.
   *
   * Two shapes because a relation has two. A column can be compared against
   * rows already in hand; a join cannot — nothing on the row says which parent
   * it belongs to, so the database is asked which of these keys are joined to
   * that one. Getting this wrong is not a page that looks broken: it is an
   * action carried out on somebody else's rows.
   */
  readonly scope?:
    | { readonly kind: "column"; readonly column: string; readonly value: unknown }
    | {
        readonly kind: "join";
        readonly joinedTo: JoinNarrowing;
        /**
         * The other end, which only the parent's side names.
         *
         * A join is written from the model that declares the relation, and
         * the child's side has a different name for it — so detaching needs
         * the parent, not the row it is narrowing by.
         */
        readonly parent: {
          readonly model: string;
          readonly id: Id;
          readonly relation: string;
        };
      };
}

export interface Reached {
  readonly action: Action;
  readonly allowed: readonly Row[];
  /** How many a guard turned down. Never why. */
  readonly refused: number;
}

/**
 * The action and the rows it may touch, or a refusal that says nothing.
 *
 * Pressing a button is a request like any other, so none of what the button
 * showed is believed: the action has to be one the table declared, the
 * principal has to be allowed it, and the selection has to name rows that are
 * still there — and, under a manager, still this parent's.
 */
export async function reachAction(
  target: ActionTarget,
  name: string,
  body: unknown,
  user: unknown,
): Promise<Reached> {
  const { data, table, model, scope } = target;

  // The allowlist is read off the declaration, so a name nobody declared
  // reaches nothing — the same oracle sorting, searching and filtering use.
  const action =
    target.action ??
    (table === undefined ? undefined : declaredActions(table).get(name));
  if (action === undefined) throw new NotFoundException();

  // A link is not something this can carry out. Answering 200 with nothing done
  // would tell the caller it worked, which is the failure this route exists to
  // avoid.
  if (!executable(action)) throw new NotFoundException();

  const { keys } = readSelection(data, model, body);
  // Restoring and destroying for good are the two whose subject is a row an
  // ordinary read leaves out. Loading them the ordinary way found nothing and
  // answered 404 — the actions could never reach what they exist for.
  const loaded = await loadSelection(data, model, keys, reads(action));
  // Dropped rather than counted as refusals: a row belonging to another parent
  // is not a row this caller was told about, and a count would say it exists.
  const rows = await narrowed(data, model, loaded, scope);
  // A key naming nothing is a row somebody deleted between the tick and the
  // press. Naming none at all is a request about nothing.
  if (rows.length === 0) throw new NotFoundException();

  // Asked once without a record first. `viewAny`, `create` and `delete` do not
  // turn on which row, so a selection of five hundred asks them once rather
  // than five hundred times; only a check that needs a record is repeated.
  const permission = permissionFor(action);
  const gate = await authorize(target.can, permission, user);
  if (gate === "denied") throw new NotFoundException();

  const allowed: Row[] = [];
  let refused = 0;
  for (const row of rows) {
    if (gate === "allowed") {
      allowed.push(row);
      continue;
    }
    const verdict = await authorize(target.can, permission, user, row);
    if (verdict === "allowed") allowed.push(row);
    else refused += 1;
  }

  // Nothing this principal may touch is answered like a resource that is not
  // there. Telling "you may not" apart from "there is no such thing" is how a
  // caller maps what exists.
  if (allowed.length === 0) throw new NotFoundException();

  return { action, allowed, refused };
}

/**
 * One transaction around the whole thing, so a batch that fails partway leaves
 * nothing behind. It wraps one record the same way it wraps fifty: what rolls
 * back must not depend on how many were ticked.
 */
export async function carryAction(options: {
  readonly data: DataAdapter;
  readonly model: string;
  readonly action: Action;
  readonly rows: readonly Row[];
  readonly user: unknown;
  readonly refusedAlready: number;
  readonly collected: FormState;
  /**
   * What narrowed the rows to one parent, for the verb that needs the parent
   * itself. Detaching is written from the other end of the join, and only that
   * end names the relation.
   */
  readonly scope?: ActionTarget["scope"];
}): Promise<ActionAnswer> {
  const { data, model, action, rows, user, refusedAlready, collected, scope } = options;
  // Read once, not once per row. `meta` is documented as resolved at bootstrap
  // and never called on a hot path, and five hundred rows is one.
  const primaryKey = data.meta(model).primaryKey.name;
  const key = (row: Row): Id => row[primaryKey] as Id;

  return await data.transaction(async (tx) => {
    // The three the framework carries out itself. Each is still asked of every
    // record — the guard decides which rows it may touch — and each is one
    // statement for fifty rows rather than fifty.
    const port = builtIn(action);
    if (port !== undefined) {
      const admitted = await admittedRecords(action, rows, user);
      const refused = refusedAlready + (rows.length - admitted.length);
      if (admitted.length === 0) return { processed: 0, refused };

      const processed = await tx[port](model, admitted.map(key));
      return { processed, refused };
    }

    // One statement for the whole selection, like the three above. Nothing is
    // destroyed: the rows stay where they are and stop being this one's.
    if (action instanceof DetachAction) {
      if (scope === undefined || scope.kind !== "join") throw new NotFoundException();
      const admitted = await admittedRecords(action, rows, user);
      const refused = refusedAlready + (rows.length - admitted.length);
      if (admitted.length === 0) return { processed: 0, refused };

      await tx.detach(
        scope.parent.model,
        scope.parent.id,
        scope.parent.relation,
        admitted.map(key),
      );
      return { processed: admitted.length, refused };
    }

    // Written one at a time, and inside the same transaction: fifty copies
    // either all land or none do, the same promise a batch delete makes.
    if (action instanceof ReplicateAction) {
      const admitted = await admittedRecords(action, rows, user);
      const refused = refusedAlready + (rows.length - admitted.length);

      let processed = 0;
      for (const row of admitted) {
        const draft = withoutIdentity(row, action.state.excludeAttributes, primaryKey);
        const answered = (await action.state.beforeReplicaSaved?.(draft, row)) ?? draft;
        // Taken off again, after the hook rather than only before it. A hook is
        // server code and therefore trusted — but the identity coming off is
        // what makes a copy a copy, and a guarantee a hook can undo by writing
        // one key back is not a guarantee.
        const settled = withoutIdentity(
          answered,
          action.state.excludeAttributes,
          primaryKey,
        );
        await tx.create(model, { set: settled });
        processed += 1;
      }
      return { processed, refused };
    }

    // What reaches the callback is what the schema admitted, never what the
    // body carried. An action with no form hands it an empty object.
    const outcome = await runAction({ action, records: rows, user, data: collected });
    return { ...outcome, refused: outcome.refused + refusedAlready };
  });
}

/**
 * Which rows an action is allowed to find.
 *
 * `with` for the two that act on marked rows, and only for those: deleting
 * reaches what a reader can see, and an action written by an author acts on the
 * page they were looking at.
 */
function reads(action: Action): DeletedRows {
  // Derived from the same answer the button is drawn from, so the two cannot
  // disagree: an action offered on a marked row has to be able to load one,
  // and one that is not offered there has no business finding it.
  return actsOn(action) === "live" ? "without" : "with";
}

/**
 * The row again, without the parts that were about that row rather than about
 * what it holds.
 *
 * The primary key first: it is what tells two rows apart, so a copy carrying it
 * is not a copy but the original written twice. Then the deletion mark, because
 * a copy of a hidden row is a new row and it starts visible. Then whatever the
 * resource named — the columns a database keeps unique, which are the ones that
 * turn the second copy into a constraint error.
 *
 * Relations are not carried. What a copy of a row means for the rows pointing
 * at it is a question with more than one answer, and a framework that picked
 * one silently would be wrong half the time. `beforeReplicaSaved` is where a
 * resource that knows its own answer says so.
 */
function withoutIdentity(
  row: Readonly<Record<string, unknown>>,
  excluded: readonly string[] | undefined,
  primaryKey: string,
): Readonly<Record<string, unknown>> {
  const dropped = new Set([primaryKey, SOFT_DELETE_FIELD, ...(excluded ?? [])]);
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => !dropped.has(column)),
  );
}

/** Which port method carries this action out, where the framework does. */
function builtIn(action: Action): "delete" | "forceDelete" | "restore" | undefined {
  if (action instanceof ForceDeleteAction) return "forceDelete";
  if (action instanceof RestoreAction) return "restore";
  if (action instanceof DeleteAction) return "delete";
  return undefined;
}

/**
 * Whether this route can carry the action out at all.
 *
 * An author's callback, or one of the ready-made ones this file knows how to
 * perform. `CreateAction` and `EditAction` are neither: they are links, and the
 * browser follows them without asking the server to do anything.
 */
function executable(action: Action): boolean {
  return action.trigger === "run";
}
