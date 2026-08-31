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
  // A view of a hidden row is a page that answers 404 and a dialog that would
  // ask for a record the read leaves out. True of the link and of the modal
  // alike, so it is said once here rather than twice at the two ends.
  if (action instanceof ViewAction) return "live";
  return "either";
}

/**
 * How wide a modal opens.
 *
 * A closed set rather than a length, because a length is a decision about a
 * panel that has to hold up on a phone as well as a desk, and a resource
 * writing `640px` has made that decision for a screen it cannot see. These are
 * ceilings: each one is the smaller of its own size and what the window has.
 */
export type ModalWidth =
  "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "screen";

/**
 * Several actions under one name.
 *
 * Presentation and nothing else. The allowlist a request is checked against,
 * the policy each one is held to, the boot's questions about them — all of
 * those are about the actions themselves, and a group that changed any of them
 * would be a place to hide one. So it flattens everywhere except where things
 * are drawn.
 *
 * Not an `Action`, because it is not one: there is nothing to run, nothing to
 * confirm and nothing to authorize. Making it one would have given it a
 * `trigger` and a `run` that mean nothing, and a route that has to remember
 * they mean nothing.
 */
export interface ActionGroupState {
  readonly label: string;
  /** A glyph beside the label. Decoration: the label carries the meaning. */
  readonly icon?: string;
  readonly actions: readonly Action[];
}

export class ActionGroup {
  readonly state: ActionGroupState;

  private constructor(state: ActionGroupState) {
    this.state = state;
  }

  static make(actions: readonly Action[]): ActionGroup {
    return new ActionGroup({ label: "More", actions: [...actions] });
  }

  label(text: string): ActionGroup {
    return new ActionGroup({ ...this.state, label: text });
  }

  icon(glyph: string): ActionGroup {
    return new ActionGroup({ ...this.state, icon: glyph });
  }
}

/** Everything in a list of actions, groups opened out. */
export function everyAction(
  list: readonly (Action | ActionGroup)[],
): readonly Action[] {
  return list.flatMap((one) =>
    one instanceof ActionGroup ? one.state.actions : [one],
  );
}

export const MODAL_WIDTHS: readonly ModalWidth[] = [
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "screen",
];

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
  /** How wide the modal opens. Absent takes what the content asks for. */
  readonly modalWidth?: ModalWidth;
  /**
   * Opens against the side of the window rather than in the middle of it.
   *
   * The same dialog either way — the focus trap, the Escape key and the inert
   * background are the platform's and do not change. What changes is where it
   * comes from, which is worth having for a form long enough that a centred
   * box would be a column of scroll.
   */
  readonly slideOver?: boolean;
  /** Opens what it shows in a dialog rather than sending the reader to a page. */
  readonly inModal?: boolean;
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

  modalWidth(width: ModalWidth): this {
    return this.with({ ...this.state, modalWidth: width });
  }

  slideOver(against = true): this {
    return this.with({ ...this.state, slideOver: against });
  }

  /**
   * What pressing it does.
   *
   * A link is followed by the browser and asks the server for nothing; a run is
   * a request. The client is told which rather than left to recognise type
   * names, so an action added later behaves correctly in a panel whose renderer
   * has never heard of it.
   */
  /**
   * What pressing it does: follow a link, ask the server to carry it out, or
   * open something to read.
   *
   * `show` is the one that changes nothing. There is no callback behind it and
   * no route to run — the client asks for content and draws it, and the way out
   * is the way out of any dialog. A confirmation on one would be asking a
   * reader to agree to being shown something.
   */
  get trigger(): "link" | "run" | "show" {
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
/**
 * Taking a row off this record, and putting one on it.
 *
 * The two verbs a relation joined through a table neither model owns has, and
 * the only two: there is no column for a create to fill and nothing for a
 * delete to remove. The row exists on its own, and what changes is whether it
 * is joined here.
 *
 * Their own permissions rather than `create` and `delete`, because they are
 * their own question: being allowed to put somebody on a project is not being
 * allowed to make a project, and taking them off it is a long way from
 * destroying one.
 */
export class DetachAction extends Action {
  static make(): DetachAction {
    return new DetachAction({});
  }

  override get type(): string {
    return "DetachAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new DetachAction({ ...this.state, ...state }) as this;
  }
}

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

  /**
   * A link, unless it was asked to open in place.
   *
   * Neither is more correct. A page has an address to send somebody and room
   * for a long infolist; a modal keeps the reader on the list they were
   * reading, which is what they want when the question is "which one is this
   * again". So it is the resource's call, and the page is the default because
   * it is the one that works with no client at all.
   */
  override get trigger(): "link" | "run" | "show" {
    return this.state.inModal === true ? "show" : "link";
  }

  override get page(): RecordPage {
    return this.state.inModal === true ? undefined : "view";
  }

  /**
   * Opens the record's infolist in a dialog rather than navigating to it.
   *
   * The same infolist the View page draws, resolved the same way against the
   * same policy. There is no second declaration for what a modal shows: a
   * resource that has said how a record reads has said it once.
   */
  inModal(open = true): this {
    return this.with({ ...this.state, inModal: open });
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
