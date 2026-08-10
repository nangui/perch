/**
 * The built-in column renderers, registered under the keys the server sends.
 *
 * Each is a plain function. None of them may call a hook, and none of them can:
 * `ColumnRenderer` is not a component type, so the flat-rendering rule is
 * enforced by the signature rather than by a review.
 */
import type { ReactNode } from "react";
import type { ColumnNode, Row } from "@perchjs/core";
import { registerColumn } from "./column-registry.js";

/**
 * A cell shows what it was given, or the em dash a table uses for nothing.
 *
 * `null` and `undefined` are both nothing here. They mean different things to a
 * database, and a table is not where that distinction is read.
 */
function text(value: unknown): ReactNode {
  switch (typeof value) {
    case "string":
      return value === "" ? nothing() : value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "object":
      return value === null ? nothing() : JSON.stringify(value);
    default:
      // A symbol, a function, `undefined`: nothing a cell can show, and
      // `String(symbol)` would throw rather than degrade.
      return nothing();
  }
}

/** The em dash a table uses for a cell with nothing in it. */
function nothing(): ReactNode {
  return <span aria-hidden>—</span>;
}

/**
 * A check or a cross, and a word for whoever is not looking at it.
 *
 * The glyph is `aria-hidden` and the word is visually hidden, so the row reads
 * as "yes" to a screen reader and as a tick to everyone else. A tick alone is a
 * cell that says nothing out loud.
 */
function icon(value: unknown): ReactNode {
  const on = Boolean(value);
  return (
    <>
      <span aria-hidden data-on={on} className="perch-cell__icon">
        {on ? "✓" : "✕"}
      </span>
      <span className="perch-visually-hidden">{on ? "yes" : "no"}</span>
    </>
  );
}

export function registerBuiltInColumns(): void {
  registerColumn("TextColumn", (value) => text(value));
  registerColumn("IconColumn", (value, _row: Row, column: ColumnNode) =>
    column.boolean === true ? icon(value) : text(value),
  );
}
