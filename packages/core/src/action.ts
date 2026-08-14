/**
 * Actions.
 *
 * One class for every trigger context — a row, the header above the table, a
 * ticked selection. There is no `BulkAction` and there will not be one: an
 * action written for a record is a bulk action already, because the bulk
 * trigger runs the same callback once per ticked record inside one transaction
 * (ADR 0017).
 *
 * `CreateAction` and `EditAction` carry no callback. They are links to pages
 * that already exist, and navigating is what they do.
 *
 * `DeleteAction` is not here yet, and deliberately: nothing executes an action
 * and nothing draws one the renderer has no meaning for, so a host declaring it
 * would get a silent nothing. It arrives with the route that carries it out.
 *
 * Not a `Component` and not a `Column`, for the reason a column is not a
 * component: an action carries no state and is met once per row, or once per
 * table.
 */
import type { Notification } from "./notification.js";
import type { Row } from "./data-adapter.js";

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
export type ActionRun = (
  record: Row,
  data: Readonly<Record<string, unknown>>,
) => Notification | void | Promise<Notification | void>;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

/**
 * Asked per record and at execution time, never only when the button is drawn.
 * A hidden button is not a protection (invariant 8).
 */
export type ActionGuard = (user: unknown, record: Row) => boolean | Promise<boolean>;

/** What a reader is asked before something irreversible happens. */
export interface Confirmation {
  readonly heading?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export interface ActionState {
  readonly label?: string;
  readonly run?: ActionRun;
  readonly authorize?: ActionGuard;
  readonly confirmation?: Confirmation;
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

  label(text: string): this {
    return this.with({ ...this.state, label: text });
  }

  /**
   * What it does, to one record.
   *
   * One record even when fifty were ticked: the framework owns the loop and
   * the transaction, so an author who never thought about bulk still has a
   * correct bulk action (ADR 0017).
   */
  action(run: ActionRun): this {
    return this.with({ ...this.state, run });
  }

  authorize(guard: ActionGuard): this {
    return this.with({ ...this.state, authorize: guard });
  }

  requiresConfirmation(confirmation: Confirmation = {}): this {
    return this.with({ ...this.state, confirmation });
  }

  danger(destructive = true): this {
    return this.with({ ...this.state, danger: destructive });
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

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new CreateAction(state) as this;
  }
}

/** Navigates to the row's edit page. Declared as a row action. */
export class EditAction extends Action {
  static make(): EditAction {
    return new EditAction({});
  }

  override get type(): string {
    return "EditAction";
  }

  override get isBuiltIn(): boolean {
    return true;
  }

  protected override with(state: ActionState): this {
    return new EditAction(state) as this;
  }
}
