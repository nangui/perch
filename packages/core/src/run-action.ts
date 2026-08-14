/**
 * Carrying out an action, over one record or fifty.
 *
 * The loop lives here rather than in each author's callback, and that is the
 * point: an action written for a record is a bulk action already, because this
 * is what runs it. What it does not own is the transaction — that belongs
 * to whoever holds the adapter, and wrapping this call is their part.
 *
 * A guard is asked per record and at execution time. A refusal stops that
 * record and not the batch, and the count says so: reporting only "done" when
 * three of fifty were refused would be a lie the reader could not check.
 */
import type { Action } from "./action.js";
import type { Row } from "./data-adapter.js";
import type { NotificationState } from "./notification.js";

export interface ActionOutcome {
  /** Records the callback ran against, to the end, without throwing. */
  readonly processed: number;
  /** Records a guard turned down. Never why — invariant 8. */
  readonly refused: number;
  /**
   * What to show, when the action said something.
   *
   * The last one that spoke wins. Fifty records answering fifty times is a
   * stack of toasts nobody reads, and the alternative — keeping only the first
   * — would hide the one that reported a problem behind forty-nine that did
   * not.
   */
  readonly notification?: NotificationState;
}

export interface ActionRequest {
  readonly action: Action;
  /** Already loaded, and already narrowed to what the resource allows. */
  readonly records: readonly Row[];
  readonly user: unknown;
  /**
   * What a modal collected.
   *
   * Whoever calls this owes it the same replay against a tree that form state
   * gets. There is no modal yet and so no tree to replay against, which is why
   * the route sends nothing rather than forwarding what a client typed.
   */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Runs an author's callback. A ready-made action has none, and the caller is
 * what knows how to carry those out — this reports nothing processed rather
 * than pretending it did the work.
 */
export async function runAction(request: ActionRequest): Promise<ActionOutcome> {
  const { action, records, user } = request;
  const run = action.state.run;
  const guard = action.state.authorize;
  const data = request.data ?? {};

  let processed = 0;
  let refused = 0;
  let notification: NotificationState | undefined;

  for (const record of records) {
    if (guard !== undefined && !(await guard(user, record))) {
      refused += 1;
      continue;
    }
    if (run === undefined) continue;

    const said = await run(record, data);
    processed += 1;
    if (said !== undefined) notification = said.state;
  }

  return {
    processed,
    refused,
    ...(notification === undefined ? {} : { notification }),
  };
}

/**
 * Which of the given records a guard admits, without running anything.
 *
 * A ready-made action acts on the set — `DeleteAction` over fifty rows is one
 * `delete(model, ids)`, not fifty — and still owes every record the same
 * question. This asks it, so the caller deletes exactly what it may.
 */
export async function admittedRecords(
  action: Action,
  records: readonly Row[],
  user: unknown,
): Promise<readonly Row[]> {
  const guard = action.state.authorize;
  if (guard === undefined) return records;

  const allowed: Row[] = [];
  for (const record of records) {
    if (await guard(user, record)) allowed.push(record);
  }
  return allowed;
}
