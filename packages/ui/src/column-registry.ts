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
 * Called once per cell; everything it needs arrives as an argument. `row` is
 * the projected one, so it carries only what the table declared.
 */
export type ColumnRenderer = (
  value: unknown,
  row: Row,
  column: ColumnNode,
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
