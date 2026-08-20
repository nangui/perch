/**
 * A record's children, managed beside it.
 *
 * The distinction worth keeping: a `Repeater` edits children *inside* the
 * parent form, and one save writes the lot in one transaction. This works
 * *alongside* — its own table, its own pages, its own actions, one operation at
 * a time. Both are needed, and treating either as the other is the mistake this
 * separation exists to prevent.
 *
 * Here rather than in `@perchjs/core` because it composes a table, which is the
 * domain's, with an authorization, which is the panel's. The domain has never
 * heard of a policy and is not going to start.
 *
 * What it does not carry is the scope. Which children belong to which parent is
 * a column the server derives from the IR at boot: the parent side of a to-many
 * holds nothing to derive it from, and a value a request carried is a value
 * that can name somebody else's parent.
 */
import type { Action, Schema, Table } from "@perchjs/core";
import { Schema as Tree, Table as Rows } from "@perchjs/core";
import type { Authorization } from "./authorization.js";

export interface RelationManagerState {
  /** The to-many on the parent. Its target is what the manager lists. */
  readonly relation: string;
  readonly label?: string;
  readonly table: Table;
  /** What creating and editing a child asks for. Absent means neither. */
  readonly form?: Schema;
  /** Its own, never the child resource's. */
  readonly can?: Authorization;
}

export class RelationManager {
  readonly state: RelationManagerState;

  private constructor(state: RelationManagerState) {
    this.state = state;
  }

  /** The name of a to-many relation on the parent's model. */
  static make(relation: string): RelationManager {
    return new RelationManager({ relation, table: Rows.make() });
  }

  /** What the reader sees. The relation's own name where none is given. */
  label(text: string): RelationManager {
    return new RelationManager({ ...this.state, label: text });
  }

  /**
   * The table the children are listed in.
   *
   * Shaped by a callback rather than handed in whole, so a manager can start
   * from one that already knows what it is for — and so the table stays the
   * manager's rather than something an author holds a second reference to.
   */
  table(shape: (table: Table) => Table): RelationManager {
    return new RelationManager({ ...this.state, table: shape(this.state.table) });
  }

  /** What creating and editing a child asks for. Without one it does neither. */
  form(shape: (schema: Schema) => Schema): RelationManager {
    return new RelationManager({
      ...this.state,
      form: shape(this.state.form ?? Tree.make()),
    });
  }

  /** What a row offers, and what the table offers as a whole. */
  actions(list: readonly Action[]): RelationManager {
    return this.table((table) => table.actions(list));
  }

  headerActions(list: readonly Action[]): RelationManager {
    return this.table((table) => table.headerActions(list));
  }

  bulkActions(list: readonly Action[]): RelationManager {
    return this.table((table) => table.bulkActions(list));
  }

  /**
   * Who may do what here.
   *
   * The manager's own, never the child resource's. The same model is managed
   * differently under different parents, so a policy written for the child's
   * own page would take effect somewhere its author never looked.
   */
  authorize(can: Authorization): RelationManager {
    return new RelationManager({ ...this.state, can });
  }
}
