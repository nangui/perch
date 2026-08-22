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

/** Every address in a cell, whichever shape the column holds them in. */
function addresses(value: unknown): readonly string[] {
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value)) return [];
  return value.filter((one): one is string => typeof one === "string" && one !== "");
}

/**
 * Images, at most as many as the column allows, and a count of the rest.
 *
 * The addresses arrive already judged: an image column says on the server which
 * of them a browser may fetch, and drops the others rather than sending them.
 * Nothing here has to ask that question a second time.
 *
 * Empty `alt`, because the cell is in a row that names itself: the row already
 * says whose face this is, and a screen reader reading the address aloud after
 * the name is noise. A column of images with meaning of their own is a column
 * whose meaning belongs in a text column beside it.
 */
function images(value: unknown, column: ColumnNode): ReactNode {
  const all = addresses(value);
  if (all.length === 0) return nothing();

  const limit = column.limit ?? all.length;
  const shown = all.slice(0, Math.max(limit, 0));
  const rest = all.length - shown.length;
  const side = column.size ?? 28;

  return (
    <span
      className="perch-cell__images"
      data-stacked={column.stacked === true ? "true" : undefined}
    >
      {shown.map((address, at) => (
        <img
          // By address and position: the same face twice in one cell is two
          // images, and neither is the other's.
          key={`${address}-${String(at)}`}
          className="perch-cell__image"
          data-circular={column.circular === true ? "true" : undefined}
          src={address}
          alt=""
          width={side}
          height={side}
          loading="lazy"
        />
      ))}
      {rest > 0 ? (
        <span className="perch-cell__more" style={{ width: side, height: side }}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/**
 * What a colour may be, before it is put in a style.
 *
 * A shape rather than a parse: this half draws the swatch and never has to know
 * what the colour is. What it does have to know is that the value came out of a
 * row, and a row holds whatever it holds — `url(...)` in a background is a
 * request to somewhere nobody chose.
 */
const COLOUR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\([^)]*\)|hsl\([^)]*\))$/i;

/**
 * A swatch, and the value that made it.
 *
 * What is not a colour is shown as the text it is: a swatch of nothing says the
 * row is empty when it is not, and the reader is the one who can tell whether
 * the column holds a mistake.
 */
function colour(value: unknown, column: ColumnNode): ReactNode {
  const said = typeof value === "string" ? value.trim() : "";
  if (said === "") return nothing();
  if (!COLOUR.test(said)) return said;

  return (
    <span className="perch-cell__colour">
      <span className="perch-cell__swatch" style={{ background: said }} aria-hidden />
      <span className="perch-cell__code">{said}</span>
      {column.copyable === true ? copy(said) : null}
    </span>
  );
}

/**
 * A button that puts the value on the clipboard.
 *
 * No state and no hook: a cell renderer is a function, which is what keeps a
 * table of a thousand cells from being a thousand components. What it says
 * afterwards is written onto the button itself and taken off again by the
 * timer, which is a fair trade for the rule holding.
 */
function copy(value: string): ReactNode {
  // Asked of the thing itself rather than of the name: a browser that carries
  // the key with nothing behind it draws a button that cannot do its one job,
  // which is worse than no button — the reader presses it and nothing happens.
  //
  // Read through a type that admits it can be missing, because the DOM library
  // says it never is and a page served over plain HTTP disagrees.
  const clipboard = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator
    ?.clipboard;
  if (clipboard === undefined) return null;

  return (
    <button
      type="button"
      className="perch-cell__copy"
      aria-label={`Copy ${value}`}
      onClick={(event) => {
        const button = event.currentTarget;
        void clipboard.writeText(value).then(
          () => {
            button.dataset["copied"] = "true";
            setTimeout(() => {
              delete button.dataset["copied"];
            }, 1200);
          },
          () => {
            // Said nowhere: the value is on the page to select by hand, and a
            // failure notice about nothing lost is noise in a table.
          },
        );
      }}
    >
      <span aria-hidden>⧉</span>
    </button>
  );
}

export function registerBuiltInColumns(): void {
  registerColumn("TextColumn", (value) => text(value));
  registerColumn("IconColumn", (value, _row: Row, column: ColumnNode) =>
    column.boolean === true ? icon(value) : text(value),
  );
  registerColumn("ImageColumn", (value, _row: Row, column: ColumnNode) =>
    images(value, column),
  );
  registerColumn("ColorColumn", (value, _row: Row, column: ColumnNode) =>
    colour(value, column),
  );
}
