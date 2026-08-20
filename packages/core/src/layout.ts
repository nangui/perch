/**
 * Layout components. No state, no validation: they group children and decide
 * the columns. The same three serve forms and infolists.
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

/** The root of a tree. */
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

/**
 * One panel of a `Tabs`, and a layout like any other inside it.
 *
 * Its label is what the tab reads, so it is asked for rather than optional: a
 * tab nobody can name is one nobody can choose.
 */
export class Tab extends Layout {
  override get type(): string {
    return "Tab";
  }

  static make(title: string): Tab {
    return configured(new Tab({ children: [], name: title, label: title }));
  }

  icon(value: string): this {
    return this.with({ icon: value });
  }
}

/**
 * A set of panels, one at a time.
 *
 * The same class in a form and in an infolist — one implementation, which is
 * what a layout being a `Component` rather than a field is for. What is inside
 * a panel nobody is looking at is still there: a field in a folded tab is
 * still a field, still filled in and still saved.
 */
export class Tabs extends Layout {
  override get type(): string {
    return "Tabs";
  }

  static make(): Tabs {
    return configured(new Tabs({ children: [] }));
  }

  /** The panels, in the order they are read. */
  tabs(panels: readonly Tab[]): this {
    return this.with({ children: [...panels] });
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
