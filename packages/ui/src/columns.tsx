/**
 * The built-in column renderers, registered under the keys the server sends.
 *
 * Each is a plain function. None of them may call a hook, and none of them can:
 * `ColumnRenderer` is not a component type, so the flat-rendering rule is
 * enforced by the signature rather than by a review.
 */
import type { ReactNode } from "react";
import { formatValue } from "./format.js";
import type { BadgedValue, ColumnNode, Row } from "@perchjs/core";
import type { CellHandle } from "./column-registry.js";
import { ChevronDown } from "./marks.js";
import { graphemesOf } from "./graphemes.js";
import { swatchable } from "./colour.js";
import { IconMark } from "./icons.js";
import { readPath } from "./read-path.js";
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
 * A swatch, and the value that made it.
 *
 * What is not a colour is shown as the text it is: a swatch of nothing says the
 * row is empty when it is not, and the reader is the one who can tell whether
 * the column holds a mistake.
 */
function colour(value: unknown, column: ColumnNode): ReactNode {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return nothing();
  // Not a colour a style may be given: shown as the words it is, rather than
  // put somewhere it would be obeyed.
  const said = swatchable(raw);
  if (said === undefined) return raw;

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
      <IconMark name="copy" className="perch-cell__copy-mark" />
    </button>
  );
}

/**
 * A switch or a box in a cell, and the same value under both.
 *
 * Drawn as a control only where the server said this reader may write and the
 * host said it would carry one out; otherwise it is the state, out of reach.
 * The value on screen is the row's, never a copy kept here — the server owns
 * it, so a refused write shows itself by the cell going back to what it was.
 *
 * Named for the row it is in. A page of switches all called "Active" is a list
 * of identical controls to anybody not reading it by eye, and the row's own
 * name is what tells them apart.
 */
function toggle(
  value: unknown,
  column: ColumnNode,
  cell: CellHandle,
  look: "switch" | "box",
): ReactNode {
  // What was asked for while it is in flight, and the row's own value the rest
  // of the time: a switch that does not move when it is pressed reads as one
  // that did not hear.
  const on = Boolean(cell.asked ?? value);
  const locked = cell.write === undefined || cell.pending;

  return (
    <span
      className={look === "switch" ? "perch-cell__toggle" : "perch-cell__tick"}
      data-pending={cell.pending ? "true" : undefined}
    >
      <input
        type="checkbox"
        role={look === "switch" ? "switch" : undefined}
        className={
          look === "switch" ? "perch-cell__toggle-input" : "perch-cell__tick-input"
        }
        aria-label={nameOf(column, cell)}
        checked={on}
        disabled={locked}
        onChange={(event) => {
          cell.write?.(event.target.checked);
        }}
      />
      <span className="perch-cell__mark" aria-hidden="true">
        {look === "switch" ? null : on ? "✓" : ""}
      </span>
    </span>
  );
}

/** The control a flavour asks for, which is the one the form draws. */
const BOXES: Readonly<Record<string, string>> = {
  text: "text",
  email: "email",
  url: "url",
  tel: "tel",
  // Deliberately not `number`: the form's own control is not one either, and a
  // spinner in a table cell is a scroll wheel that edits the row underneath.
  numeric: "text",
  password: "password",
};

/**
 * A line of text, edited where it is read.
 *
 * Uncontrolled on purpose. A renderer is a function and may hold nothing, so
 * the half-typed value lives in the input itself — which is where a browser
 * keeps one anyway, and which is why this needs no state and breaks no rule.
 *
 * The server's answer is put back through the element rather than through a
 * key. Replacing the input on a new value costs the focus, and the value moves
 * exactly when the answer to the reader's own write lands — so pressing Enter
 * took the cursor out of the box they were still standing in. Written straight
 * onto the element, and only while nobody is in it, nothing moves under them.
 *
 * It commits when the box is left and on Enter, never on a keystroke: a write
 * per character is a write per character.
 */
function line(value: unknown, column: ColumnNode, cell: CellHandle): ReactNode {
  const held = typeof value === "string" ? value : "";
  if (cell.write === undefined) return text(value);

  const commit = (input: HTMLInputElement): void => {
    if (input.value === held) return;
    cell.write?.(input.value);
  };

  return (
    <input
      ref={(element) => {
        // Left alone while the reader is in it: what they have typed is theirs
        // until they commit it or leave.
        if (element === null || element === document.activeElement) return;
        if (element.value !== held) element.value = held;
      }}
      // What the form would have drawn. A bare line of text over an address is
      // a box that takes anything and only says no after the round trip — and
      // on a phone it brings up the wrong keyboard.
      type={BOXES[column.flavour ?? "text"] ?? "text"}
      className="perch-control perch-cell__line"
      aria-label={nameOf(column, cell)}
      defaultValue={held}
      {...(column.maxLength === undefined ? {} : { maxLength: column.maxLength })}
      data-pending={cell.pending ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget);
          return;
        }
        if (event.key !== "Escape") return;
        // Back to what the row holds, which is what the server last said.
        event.currentTarget.value = held;
        event.currentTarget.blur();
      }}
      onBlur={(event) => {
        commit(event.currentTarget);
      }}
    />
  );
}

/** What a cell holds, as the string a control compares against. */
function chosen(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * One of a few, chosen where it is read.
 *
 * The choices come from the field, over the wire, so the cell offers exactly
 * what the boundary will take. A choice commits the moment it is made: unlike a
 * line of text there is nothing half-typed to wait for.
 *
 * Uncontrolled, like the line of text, and for the same reason — a renderer
 * holds nothing. The server's answer is written onto the element when nobody is
 * standing in it.
 */
function choose(value: unknown, column: ColumnNode, cell: CellHandle): ReactNode {
  const held = chosen(value);
  const options = column.options ?? [];
  if (cell.write === undefined || options.length === 0) return text(value);

  return (
    <span className="perch-picker">
      <select
        ref={(element) => {
          // Unconditionally, unlike a line of text: there is nothing half-typed
          // in a list to protect, and choosing leaves the focus on the control —
          // so skipping a focused one left a refused choice on screen, over a row
          // that says otherwise.
          if (element === null) return;
          const now = held ?? "";
          if (element.value !== now) element.value = now;
        }}
        className="perch-control perch-cell__choice"
        aria-label={nameOf(column, cell)}
        defaultValue={held ?? ""}
        disabled={cell.pending}
        data-pending={cell.pending ? "true" : undefined}
        onChange={(event) => {
          // Nothing is `null` rather than the empty string: a column that may hold
          // nothing should come back to nothing, not to a blank.
          cell.write?.(event.target.value === "" ? null : event.target.value);
        }}
      >
        {/* Always offered, whatever the cell holds: a control that can take a
            value and never give it back is a one-way door. Whether the field
            allows nothing is the field's answer, and it gives it by refusing. */}
        <option value="">—</option>
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            // The server said this one may not be chosen. Offered anyway, it is
            // picked, refused at the boundary, and nothing happens.
            disabled={option.disabled === true}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown />
    </span>
  );
}

/**
 * What this cell is called, out loud.
 *
 * The column says which cell and the table says which row. A page of switches
 * all called "Active" is a list of identical controls to anybody not reading it
 * by eye; a switch called "Active: /files/avatars/ada.png" is worse, and that
 * is what reading the row's own first string gave.
 */
function nameOf(column: ColumnNode, cell: CellHandle): string {
  const what = column.label ?? column.path;
  return cell.rowName === undefined ? what : `${what}: ${cell.rowName}`;
}

export function registerBuiltInColumns(): void {
  /**
   * A value drawn as a state.
   *
   * What arrives is what `BadgeColumn.present` settled on the server: the value
   * and the tone it was judged to carry, because the map from one to the other is
   * a rule somebody wrote in a resource and no browser can reconstruct it.
   *
   * A value the server never passed through that judgement is drawn neutral
   * rather than refused — a column may name a path a row has nothing at, and
   * `presentRows` leaves such a value where it found it.
   *
   * Empty stays the dash every other column shows. A badge around nothing is a
   * coloured box saying a field is blank, which is louder than the fact.
   */
  function badge(held: unknown): ReactNode {
    const badged = isBadged(held);
    const value = badged ? held.value : held;
    // Read from the value rather than from what `text` drew, which is a fresh
    // element every call and equal to nothing, itself included.
    if (value === null || value === undefined || value === "") return nothing();

    return (
      <span className={`perch-badge perch-badge--${badged ? held.tone : "neutral"}`}>
        {text(value)}
      </span>
    );
  }

  /**
   * Whether this value carries its own tone.
   *
   * Written here rather than imported: this package takes types from the core and
   * no code, so a guard the core could have exported is one line repeated instead
   * of an arrow pointing the wrong way.
   */
  function isBadged(value: unknown): value is BadgedValue {
    return (
      typeof value === "object" && value !== null && "tone" in value && "value" in value
    );
  }

  /**
   * A face, a name, and the line under it, drawn as one thing.
   *
   * The value handed in is the name, because that is the path the column is named
   * by and the one it sorts on. The other two are read out of the row, from the
   * paths the column carries — the row is the projected one, so what is not
   * declared is not there and this reads nothing the server did not send.
   *
   * The face is optional twice over: a column may declare no image path, and a
   * row may hold nothing at it. Either way the initials stand in, which keeps the
   * column one width down its whole length rather than ragged where a picture is
   * missing.
   */
  function identity(value: unknown, row: Row, column: ColumnNode): ReactNode {
    const name = typeof value === "string" ? value : "";
    const face = column.image === undefined ? undefined : readPath(row, column.image);
    const under =
      column.description === undefined ? undefined : readPath(row, column.description);
    const side = column.size ?? 32;

    return (
      <span className="perch-cell__identity">
        {typeof face === "string" && face !== "" ? (
          <img
            className="perch-cell__face"
            data-circular={column.circular ? "true" : undefined}
            src={face}
            alt=""
            width={side}
            height={side}
          />
        ) : (
          // `aria-hidden`, because the name is right beside it: read out, the
          // initials are the same name a second time and a stutter.
          <span
            aria-hidden
            className="perch-cell__face perch-cell__face--empty"
            data-circular={column.circular ? "true" : undefined}
            style={{ width: side, height: side }}
          >
            {initials(name)}
          </span>
        )}
        <span className="perch-cell__named">
          <span className="perch-cell__name">{text(value)}</span>
          {under === null || under === undefined || under === "" ? null : (
            <span className="perch-cell__under">{text(under)}</span>
          )}
        </span>
      </span>
    );
  }

  /**
   * At most two letters, from the first two words.
   *
   * By grapheme rather than by code unit: `name[0]` on a name starting outside
   * the basic plane is half a character, which renders as a replacement box —
   * and by grapheme rather than by code point, so a letter carrying a combining
   * accent keeps it instead of arriving bare.
   */
  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter((word) => word !== "")
      .slice(0, 2)
      .map((word) => graphemesOf(word)[0] ?? "")
      .join("")
      .toUpperCase();
  }

  /**
   * A number drawn as a length, with the number kept beside it.
   *
   * Both, because a bar answers "which of these is short" at a glance and answers
   * "how short" not at all. The digits stay for the reader who came for one row.
   *
   * The proportion is worked out here. That is not business logic and not state:
   * it is where a value the server settled falls between two ends the server
   * declared, and sending a percentage would mean sending the same fact twice.
   *
   * `role="meter"` rather than a bare box, so what a sighted reader gets from the
   * length somebody using a screen reader gets from the value — a div of a given
   * width says nothing at all.
   */
  function gauge(value: unknown, column: ColumnNode, cell: CellHandle): ReactNode {
    const held =
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    if (held === undefined) {
      // A number that is not one — `NaN`, an infinity — has no length and no
      // digits worth showing, so it takes the dash. Anything else is shown as it
      // is: a column that cannot draw a bar can still say what it holds.
      return typeof value === "number" ? nothing() : text(value);
    }

    const low = column.min ?? 0;
    const high = column.max ?? 100;
    // Clamped, because a stored value outside the scale is a bar past the end of
    // its track — and a scale declared backwards is somebody's typo rather than a
    // reason to draw nothing.
    const span = Math.abs(high - low);
    const filled =
      span === 0 ? 0 : Math.min(100, Math.max(0, ((held - low) / (high - low)) * 100));

    return (
      <span className="perch-cell__gauge">
        <span
          className="perch-cell__gauge-track"
          role="meter"
          aria-valuenow={held}
          aria-valuemin={low}
          aria-valuemax={high}
          aria-label={nameOf(column, cell)}
        >
          <span
            className="perch-cell__gauge-fill"
            style={{ inlineSize: `${String(filled)}%` }}
          />
        </span>
        <span className="perch-cell__gauge-value">{held}</span>
      </span>
    );
  }

  registerColumn("TextColumn", (value, _row: Row, column: ColumnNode) =>
    text(formatValue(value, column) ?? value),
  );
  registerColumn("GaugeColumn", (value, _row: Row, column, cell) =>
    gauge(value, column, cell),
  );
  registerColumn("AvatarColumn", (value, row: Row, column: ColumnNode) =>
    identity(value, row, column),
  );
  registerColumn("BadgeColumn", (value) => badge(value));
  registerColumn("IconColumn", (value, _row: Row, column: ColumnNode) =>
    column.boolean === true ? icon(value) : text(value),
  );
  registerColumn("ImageColumn", (value, _row: Row, column: ColumnNode) =>
    images(value, column),
  );
  registerColumn("ColorColumn", (value, _row: Row, column: ColumnNode) =>
    colour(value, column),
  );
  registerColumn("ToggleColumn", (value, _row: Row, column, cell) =>
    toggle(value, column, cell, "switch"),
  );
  registerColumn("CheckboxColumn", (value, _row: Row, column, cell) =>
    toggle(value, column, cell, "box"),
  );
  registerColumn("TextInputColumn", (value, _row: Row, column, cell) =>
    line(value, column, cell),
  );
  registerColumn("SelectColumn", (value, _row: Row, column, cell) =>
    choose(value, column, cell),
  );
}
