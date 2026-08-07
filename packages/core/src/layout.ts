/**
 * Layout components — PRD 02 §3.1. No state, no validation: they group children
 * and decide the columns. The same three serve forms and infolists (PRD 09 §2.1).
 */
import type { ComponentState, Resolvable } from "./component.js";
import { Component, configured } from "./component.js";

export type Columns = number | { readonly default: number; readonly md?: number };

interface LayoutState extends ComponentState {
  readonly columns?: Columns;
  readonly description?: Resolvable<string>;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean;
  readonly icon?: string;
}

abstract class Layout extends Component {
  declare readonly state: LayoutState;

  protected override with(patch: Partial<LayoutState>): this {
    return super.with(patch);
  }

  columns(value: Columns): this {
    return this.with({ columns: value });
  }
}

/** The root of a tree, per PRD 02 §2. */
export class Schema extends Layout {
  override get type(): string {
    return "Schema";
  }

  static make(children: readonly Component[] = []): Schema {
    return configured(new Schema({ children: [...children] }));
  }
}

export class Section extends Layout {
  override get type(): string {
    return "Section";
  }

  static make(title?: string): Section {
    // Spread rather than assign: `exactOptionalPropertyTypes` distinguishes an
    // absent property from one set to `undefined`.
    return configured(
      new Section({
        children: [],
        ...(title === undefined ? {} : { name: title, label: title }),
      }),
    );
  }

  description(value: Resolvable<string>): this {
    return this.with({ description: value });
  }

  icon(value: string): this {
    return this.with({ icon: value });
  }

  collapsible(value = true): this {
    return this.with({ collapsible: value });
  }

  /** Implies `collapsible`: collapsed but not collapsible is a trap. */
  collapsed(value = true): this {
    return this.with({ collapsed: value, collapsible: true });
  }
}

export class Grid extends Layout {
  override get type(): string {
    return "Grid";
  }

  static make(columns?: Columns): Grid {
    const grid = new Grid({ children: [] });
    return configured(columns === undefined ? grid : grid.columns(columns));
  }
}
