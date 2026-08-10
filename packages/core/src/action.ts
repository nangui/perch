/**
 * Row actions — PRD 08 §4.
 *
 * `EditAction` is the one of them this file carries. It is v0.1 and it is
 * navigation: a link to the page that already exists. The rest of §4 —
 * `CreateAction`, `DeleteAction`, modals, confirmations, bulk — needs a route
 * or a dialog that does not, and an action that renders and does nothing would
 * be worse than one that is absent.
 *
 * Not a `Component` and not a `Column`, for the reason a column is not a
 * component: this is met once per row and carries no state.
 */

export interface ActionState {
  readonly label?: string;
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
}

/** Navigates to the row's edit page. */
export class EditAction extends Action {
  static make(): EditAction {
    return new EditAction({});
  }

  override get type(): string {
    return "EditAction";
  }

  protected override with(state: ActionState): this {
    return new EditAction(state) as this;
  }
}
