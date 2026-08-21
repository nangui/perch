/**
 * Layout components. No state, no validation: they group children and decide
 * the columns. The same three serve forms and infolists.
 */
import type { ComponentState, Resolvable } from "./component.js";
import { Component, configured } from "./component.js";
import type { EntryTone } from "./entries/text-entry.js";

export type Columns = number | { readonly default: number; readonly md?: number };

interface LayoutState extends ComponentState {
  readonly columns?: Columns;
  readonly tone?: EntryTone;
  readonly description?: Resolvable<string>;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean;
  readonly icon?: string;
}

/**
 * Exported so the cycle can narrow to one.
 *
 * What a layout carries beyond a component — its columns, its own line of
 * prose, the mark beside its title — is read by the resolver, and reading it
 * through a cast would assert a shape nothing checks: rename a property here
 * and the cast keeps compiling while the value silently stops arriving.
 */
export abstract class Layout extends Component {
  declare readonly state: LayoutState;

  protected override with(patch: Partial<LayoutState>): this {
    return super.with(patch);
  }

  columns(value: Columns): this {
    return this.with({ columns: value });
  }

  /**
   * The layout's own line of prose, under its title and above what it holds.
   *
   * On the base rather than on one of them: the cycle resolves it for any
   * layout, and a callout that could not say anything would be a box.
   */
  description(value: Resolvable<string>): this {
    return this.with({ description: value });
  }

  /**
   * The mark beside the title. Here for the same reason, and because it was
   * written twice: once on a section and once on a tab, so a callout that
   * serialised one had no way to declare it.
   */
  icon(value: string): this {
    return this.with({ icon: value });
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

  collapsible(value = true): this {
    return this.with({ collapsible: value });
  }

  /** Implies `collapsible`: collapsed but not collapsible is a trap. */
  collapsed(value = true): this {
    return this.with({ collapsed: value, collapsible: true });
  }
}

/**
 * A group of fields that belong together, and nothing more.
 *
 * Lighter than a section on purpose: no card, no collapsing, no place for a
 * page to be divided at. Two dates that make a range, a street and a postcode —
 * the grouping is what is being said, and a section around two fields says the
 * page has a part called that.
 *
 * The browser has an element for exactly this, which is where the name comes
 * from and what its renderer draws: a group with a name is a thing a screen
 * reader announces on the way in, for free, and a `div` with a heading is not.
 */
export class Fieldset extends Layout {
  override get type(): string {
    return "Fieldset";
  }

  static make(label?: string): Fieldset {
    return configured(
      new Fieldset({
        children: [],
        ...(label === undefined ? {} : { name: label, label }),
      }),
    );
  }
}

/**
 * A box that says something, in one of the panel's four tones.
 *
 * A layout rather than an entry or a field: it holds no value, is bound to no
 * column, and is read the same way in a form and in an infolist. What it says
 * is a description like a section's — resolvable, because the sentence a reader
 * needs usually depends on the record in front of them.
 *
 * It may hold children. A warning above the two fields it is about reads as one
 * thing; the same warning floating beside them reads as a page decoration.
 */
export class Callout extends Layout {
  override get type(): string {
    return "Callout";
  }

  static make(heading?: string): Callout {
    return configured(
      // No tone here: the renderer already falls back to the quiet one, and a
      // default written twice is one that can disagree with itself.
      new Callout({
        children: [],
        ...(heading === undefined ? {} : { name: heading, label: heading }),
      }),
    );
  }

  /**
   * Which of the four, and no more than the four.
   *
   * The same set a badge and an entry already use. A callout is the third thing
   * to want a tone, and a fifth name here would be a colour the stylesheet has
   * not got — which reads as a rendering fault rather than as a tone.
   */
  tone(value: EntryTone): this {
    return this.with({ tone: value });
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
