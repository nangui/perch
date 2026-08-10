/**
 * Actions — PRD 08 §4.
 *
 * The two of §4 that are v0.1 *and* navigation: `EditAction` on a row and
 * `CreateAction` above the table. Both are links to pages that already exist.
 * The rest — `DeleteAction`, modals, confirmations, bulk — needs a route or a
 * dialog that does not, and an action that renders and does nothing would be
 * worse than one that is absent.
 *
 * Not a `Component` and not a `Column`, for the reason a column is not a
 * component: an action carries no state and is met once per row, or once per
 * table.
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

/** Navigates to the resource's create page. Declared as a header action. */
export class CreateAction extends Action {
  static make(): CreateAction {
    return new CreateAction({});
  }

  override get type(): string {
    return "CreateAction";
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

  protected override with(state: ActionState): this {
    return new EditAction(state) as this;
  }
}
