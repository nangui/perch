/**
 * Actions.
 *
 * One class for every trigger context — a row, the header above the table, a
 * ticked selection. There is no `BulkAction` and there will not be one: an
 * action written for a record is a bulk action already, because the bulk
 * trigger runs the same callback once per ticked record inside one
 * transaction.
 *
 * `CreateAction` and `EditAction` carry no callback. They are links to pages
 * that already exist, and navigating is what they do.
 *
 * `DeleteAction` carries none either, and is not inert: the route knows what
 * deleting means, which is what `isBuiltIn` distinguishes.
 *
 * Not a `Component` and not a `Column`, for the reason a column is not a
 * component: an action carries no state and is met once per row, or once per
 * table.
 */
import type { Notification } from "./notification.js";
import type { Row } from "./data-adapter.js";
import type { Schema } from "./layout.js";

/**
 * What an author's callback is handed, and what it may answer.
 *
 * `void` on both sides of the union, and it has to be: without it in the outer
 * one a synchronous body with no `return` is refused, and without it inside the
 * `Promise` an `async` one is. Measured, both ways.
 */
/* The rule is about `void` standing in for `undefined`. This is a callback
   return, where "answers nothing" is the ordinary case and has to stay
   writable. Disabled as a block rather than for the next line: the union is
   four lines below the declaration it belongs to. */
/* eslint-disable @typescript-eslint/no-invalid-void-type */
/** The pages one row has. `undefined` for an action that is not a link. */
export type RecordPage = "edit" | "view" | undefined;

export type ActionRun = (
  record: Row,
  data: Readonly<Record<string, unknown>>,
) => Notification | void | Promise<Notification | void>;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

/**
 * Asked per record and at execution time, never only when the button is drawn.
 * A hidden button is not a protection.
 */
export type ActionGuard = (user: unknown, record: Row) => boolean | Promise<boolean>;

/** What a reader is asked before something irreversible happens. */
export interface Confirmation {
  readonly heading?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

/**
 * Which rows an action means anything on.
 *
 * A restore has nothing to do to a row that was never hidden, a delete has
 * nothing to do to one already hidden, and a copy cannot reach one at all — the
 * read that finds its subject leaves marked rows out. Everything else works on
 * either.
 *
 * Answered here rather than in the client, which kept its own list of two. A
 * button drawn on a row the route will refuse is a button that does nothing
 * when pressed, and the third action needing the rule is what shows that a list
 * of two was a list waiting to be wrong.
 */
export type ActsOn = "live" | "marked" | "either";

export function actsOn(action: Action): ActsOn {
  if (action instanceof RestoreAction) return "marked";
  if (action instanceof ForceDeleteAction) return "either";
  if (action instanceof DeleteAction) return "live";
  if (action instanceof ReplicateAction) return "live";
  return "either";
}

export interface ActionState {
  /** How a request names it. Defaults to the type; `.name()` tells two apart. */
  readonly name?: string;
  readonly label?: string;
  readonly run?: ActionRun;
  readonly authorize?: ActionGuard;
  readonly confirmation?: Confirmation;
  /** What a modal collects before it runs. */
  readonly form?: Schema;
  /** Drawn as destructive, and says so before it runs. */
  readonly danger?: boolean;
}

export abstract class Action {
  readonly state: ActionState;

  /** Keys the renderer registry, and survives minification. */
  abstract get type(): string;

  constructor(state: ActionState) {
    this.state = state;
  }

  /** Every fluent method clones: a builder shared between requests leaks. */
  protected abstract with(state: ActionState): this;

  /**
   * What a request calls it.
   *
   * Left unset it is the type, which is enough until a table declares two of
   * the same kind — then one of them can never be reached, and
   * `declaredActions` says so at boot rather than letting the wrong one run.
   */
  name(value: string): this {
    return this.with({ ...this.state, name: value });
  }

  label(text: string): this {
    return this.with({ ...this.state, label: text });
  }

  /**
   * What it does, to one record.
   *
   * One record even when fifty were ticked: the framework owns the loop and
   * the transaction, so an author who never thought about bulk still has a
   * correct bulk action.
   */
  action(run: ActionRun): this {
    return this.with({ ...this.state, run });
  }

  authorize(guard: ActionGuard): this {
    return this.with({ ...this.state, authorize: guard });
  }

  /**
   * A schema the reader fills before it runs.
   *
   * Resolved without a record, and filled once however many rows were ticked.
   * The callback runs per record; this does not — a field that depended on a
   * record would have nothing to answer for over fifty of them.
   */
  form(schema: Schema): this {
    return this.with({ ...this.state, form: schema });
  }

  requiresConfirmation(confirmation: Confirmation = {}): this {
    return this.with({ ...this.state, confirmation });
  }

  danger(destructive = true): this {
    return this.with({ ...this.state, danger: destructive });
  }

  /**
   * What pressing it does.
   *
   * A link is followed by the browser and asks the server for nothing; a run is
   * a request. The client is told which rather than left to recognise type
   * names, so an action added later behaves correctly in a panel whose renderer
   * has never heard of it.
   */
  get trigger(): "link" | "run" {
    return "run";
  }

  /**
   * For a link, which of the record's pages it leads to.
   *
   * A page, not an address: where a panel is mounted and how a row is keyed are
   * the client's to compose, and a domain that spelled out `/edit` would be
   * naming a route it has no business knowing.
   */
  get page(): RecordPage {
    return undefined;
  }

  /**
   * Whether the framework carries out the action itself.
   *
   * A ready-made action has no author callback and is not inert: `EditAction`
   * means go to the edit page, and the renderer knows what that means. Telling
   * the two apart is what lets the audit complain about an action that means
   * nothing to anybody — declared, drawn, and doing nothing when pressed.
   */
  get isBuiltIn(): boolean {
    return false;
  }
}

/** Navigates to the resource's create page. Declared as a header action. */
export class CreateAction extends Action {
  static make(): CreateAction {
    return new CreateAction({});
  }

  override get type(): string {
    return "CreateAction";
  }

  override get trigger(): "link" | "run" {
    return "link";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new CreateAction(state) as this;
  }
}

/** Navigates to the row's edit page. Declared as a row action. */
export class EditAction extends Action {
  override get page(): RecordPage {
    return "edit";
  }

  static make(): EditAction {
    return new EditAction({});
  }

  override get type(): string {
    return "EditAction";
  }

  override get trigger(): "link" | "run" {
    return "link";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new EditAction(state) as this;
  }
}

/**
 * Lifts the mark a delete put on a row.
 *
 * No confirmation. Restoring is the one operation here that undoes rather than
 * decides — a reader who did not mean it deletes again, and nothing was lost in
 * between. Asking first would be asking about the wrong direction.
 */
export class RestoreAction extends Action {
  static make(): RestoreAction {
    return new RestoreAction({});
  }

  override get type(): string {
    return "RestoreAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new RestoreAction(state) as this;
  }
}

/**
 * Destroys the rows for good, marked or not. Confirms by default.
 *
 * The one operation the panel offers that nothing undoes. `DeleteAction` on a
 * soft-deleting model hides a row and a restore brings it back; this leaves
 * nothing to bring back, which is why it asks first and why the policy that
 * allows it is not the one that allows hiding.
 */
export class ForceDeleteAction extends Action {
  static make(): ForceDeleteAction {
    return new ForceDeleteAction({ danger: true, confirmation: {} });
  }

  override get type(): string {
    return "ForceDeleteAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new ForceDeleteAction(state) as this;
  }
}

/**
 * What a replica is handed to before it is written.
 *
 * The copy, and the row it was copied from. Returning a tree replaces it;
 * returning nothing keeps the one that was passed in, which is the shape a
 * hook that only wants to change one column should be able to take.
 */
export type BeforeReplicaSaved = (
  replica: Readonly<Record<string, unknown>>,
  original: Row,
) =>
  | Readonly<Record<string, unknown>>
  | undefined
  | Promise<Readonly<Record<string, unknown>> | undefined>;

export interface ReplicateActionState extends ActionState {
  readonly excludeAttributes?: readonly string[];
  readonly beforeReplicaSaved?: BeforeReplicaSaved;
}

/**
 * Writes the row again, as a new one.
 *
 * The identity never comes with it. A primary key is what tells two rows apart,
 * and a copy carrying the original's is not a copy — it is the original,
 * written twice. The deletion mark goes the same way: a copy of a hidden row is
 * a new row, and it starts visible.
 *
 * Everything else does come, which is the point and also the trap: a column the
 * database keeps unique is copied into a value that already exists, and the
 * second copy is a constraint error rather than a row. `.excludeAttributes()`
 * is how a resource says which those are, and the boot says which it has found.
 *
 * It asks the `create` policy and not the `edit` one. It makes a row, and a
 * reader who may change what is there is not thereby allowed to add to it.
 */
export class ReplicateAction extends Action {
  declare readonly state: ReplicateActionState;

  static make(): ReplicateAction {
    return new ReplicateAction({});
  }

  override get type(): string {
    return "ReplicateAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new ReplicateAction({ ...this.state, ...state }) as this;
  }

  /** Columns the copy leaves behind: the unique ones, and the dated ones. */
  excludeAttributes(names: readonly string[]): this {
    return this.#also({ excludeAttributes: [...names] });
  }

  /** A last word before it is written, for what a copy cannot simply carry. */
  beforeReplicaSaved(hook: BeforeReplicaSaved): this {
    return this.#also({ beforeReplicaSaved: hook });
  }

  /** Its own clone, the base's taking only what every action has. */
  #also(patch: Partial<ReplicateActionState>): this {
    return new ReplicateAction({ ...this.state, ...patch }) as this;
  }
}

/**
 * Navigates to the row's View page, which is the infolist.
 *
 * A link like `EditAction`, so nothing is ever asked of the action route: the
 * browser follows it and the page decides for itself who may read it.
 */
export class ViewAction extends Action {
  static make(): ViewAction {
    return new ViewAction({});
  }

  override get type(): string {
    return "ViewAction";
  }

  override get trigger(): "link" | "run" {
    return "link";
  }

  override get page(): RecordPage {
    return "view";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new ViewAction(state) as this;
  }
}

/**
 * Destroys the rows. Confirms by default.
 *
 * `.requiresConfirmation()` sets what the question says, and nothing removes
 * it: every fluent method clones from the state it already has, so what
 * `make()` set survives the whole chain. Deleting is the one thing v0.1 cannot
 * undo — soft delete arrives in v0.2 with the restore it needs to be usable —
 * so an unprompted delete button is a misclick waiting to happen.
 */
export class DeleteAction extends Action {
  static make(): DeleteAction {
    return new DeleteAction({ danger: true, confirmation: {} });
  }

  override get type(): string {
    return "DeleteAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new DeleteAction(state) as this;
  }
}
