/**
 * What an infolist is made of.
 *
 * An entry sits in the same tree as a field and is not one. It holds no state,
 * admits nothing, validates nothing and is never written: it names a place in
 * the record and shows what is there.
 *
 * That it extends `Component` rather than `Field` is the whole design. The
 * layouts are shared because they belong to `Component`, and everything a field
 * carries — rules, `live`, `afterStateUpdated`, `toStorage`, `acceptsClient` —
 * stays out of reach rather than being switched off. The three files that must
 * stay boring all key on `instanceof Field`, so a tree of entries admits
 * nothing without a rule of its own.
 */
import type { ComponentState, Resolvable } from "./component.js";
import { Component } from "./component.js";

export interface EntryState extends ComponentState {
  /** Shown where the record has nothing. Resolved, like every other one. */
  readonly placeholder?: Resolvable<string>;
}

export abstract class Entry extends Component {
  declare readonly state: EntryState;

  protected override with(patch: Partial<EntryState>): this {
    return super.with(patch);
  }

  /**
   * Where the value lives **in the record** — `customer.email`.
   *
   * Not a state path, which is what a field's name is, and the two must never
   * be converted into one another. A field's name says where a value lives
   * while the reader edits it; this says where one lives in the row. They are
   * told apart by what declares them, never by their shape.
   */
  get recordPath(): string {
    return this.state.name ?? "";
  }

  placeholder(value: Resolvable<string>): this {
    return this.with({ placeholder: value });
  }
}
