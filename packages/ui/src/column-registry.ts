/**
 * The column registry — deliberately not the shape of `registry.ts`.
 *
 * A field renderer is a `ComponentType`; a column renderer is a function, and
 * that difference is the constraint. Filament v4 had to rewrite its cell
 * rendering because nested components collapsed at volume; a registry accepting
 * a `ComponentType` here would make repeating it a one-line mistake. A function
 * cannot call a hook, and the type says so.
 *
 * Keyed on the `type` the server sends, for the reason `registry.ts` gives.
 */
import type { ReactNode } from "react";
import type { ColumnNode, Row } from "@perchjs/core";

/**
 * What a cell may do besides show itself.
 *
 * A renderer is a function and may hold nothing, so anything a cell needs to
 * remember is remembered by the table and handed back: whether this one is
 * waiting on the server, and how to ask for a new value. Absent handler, no
 * control — a table that cannot write draws none, for the reason a row draws no
 * action nobody would carry out.
 */
export interface CellHandle {
  /** Asks the server for a new value. Absent where nothing would carry it out. */
  readonly write?: (value: unknown) => void;
  /** A write is in flight for this cell. The control says so and refuses input. */
  readonly pending: boolean;
  /**
   * What this row is called, for naming a control inside it.
   *
   * Read from the table rather than from the row: a cell cannot tell an avatar's
   * address from a person's name, and the table already knows which column is
   * the one a reader reads the row by. Absent where no column says.
   */
  readonly rowName?: string;
}

/**
 * Called once per cell; everything it needs arrives as an argument. `row` is
 * the projected one, so it carries only what the table declared.
 */
export type ColumnRenderer = (
  value: unknown,
  row: Row,
  column: ColumnNode,
  cell: CellHandle,
) => ReactNode;

const RENDERERS = new Map<string, ColumnRenderer>();

export function registerColumn(type: string, render: ColumnRenderer): void {
  RENDERERS.set(type, render);
}

export function lookupColumn(type: string): ColumnRenderer | undefined {
  return RENDERERS.get(type);
}

/** Test seam: a registration would otherwise leak between suites. */
export function resetColumnRegistry(): void {
  RENDERERS.clear();
}
