/**
 * `ColorPicker` — a swatch to pick with and a box to type in.
 *
 * Both speak hex, which is all this half knows about: the notation the column
 * keeps is settled on the server, so nothing here has to carry the arithmetic
 * for the other two.
 *
 * The box shows the value whatever it is, because a column somebody else
 * filled is where a reader finds out it holds a word. The swatch only ever
 * shows a colour, and says none where there is none to show.
 *
 * The box holds what is being typed rather than the value, and only a colour
 * ever reaches the form: `#2159` on the way to `#21594a` is not one, and sent,
 * it would be turned away at the boundary in silence. What does not parse is
 * dropped when the box is left, which puts the colour back as it was.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

/** What a colour control can be given, and what the box has to produce. */
const HEX = /^#[0-9a-f]{6}$/;

export interface ColorPickerProps {
  /** The colour, as hex. `null` is a column with none in it. */
  readonly value: string | null;
  readonly onValueChange: (value: string | null) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Names the swatch, which is a control of its own. */
  readonly label: string;
  readonly placeholder?: string;
}

export function ColorPicker({
  value,
  onValueChange,
  status,
  binding,
  label,
  placeholder,
}: ColorPickerProps): ReactNode {
  // Undefined while nothing is being typed, so a colour the server sends back
  // is what the box shows without an effect to copy it across.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const locked = isLocked(status);

  // What the swatch can show, which is not always what the field holds: a
  // column somebody else filled can hold a word, and the box is where the
  // reader reads it. Shown as black, the swatch would state a colour nobody
  // chose, so it says none instead.
  const shown = value !== null && HEX.test(value) ? value : null;

  /**
   * `settled` is the box being left or Enter being pressed.
   *
   * It is what tells `#ff8` the shorthand from `#ff8` on the way to `#ff8800`.
   * Taken as it is typed, the shorthand turns the swatch a colour the reader
   * is halfway through not choosing.
   */
  function commit(text: string, settled: boolean): void {
    const colour = asHex(text, settled);
    if (colour !== undefined && colour !== value) onValueChange(colour);
  }

  return (
    <div
      className="perch-control perch-color"
      // The one thing a colour control cannot show is no colour: it has a
      // value whatever happens. So the frame says it instead — the same dashed
      // frame every other empty control on the page wears.
      data-empty={shown === null ? "true" : "false"}
      {...statusAttributes(status)}
    >
      {/* The well is what shows no colour: a colour control has one whatever
          happens, so with nothing to show it is covered by the struck-through
          square that means none — which still opens the picker when clicked. */}
      <span className="perch-color__well">
        <input
          type="color"
          className="perch-color__swatch"
          aria-label={`Pick ${label}`}
          value={shown ?? "#000000"}
          disabled={locked}
          onChange={(event) => {
            setDraft(undefined);
            onValueChange(event.target.value.toLowerCase());
          }}
        />
      </span>
      <input
        type="text"
        className="perch-control__input perch-color__text"
        spellCheck={false}
        autoComplete="off"
        {...binding}
        {...(placeholder === undefined ? {} : { placeholder })}
        value={draft ?? value ?? ""}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value, false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || draft === undefined) return;
          commit(draft, true);
          setDraft(undefined);
        }}
        onBlur={() => {
          // Only what was typed. An empty draft is nothing typed, not an empty
          // box — otherwise tabbing through the field clears the colour.
          if (draft !== undefined) commit(draft, true);
          setDraft(undefined);
        }}
      />
      <StatusMark status={status} />
    </div>
  );
}

/**
 * What was typed, as the hex the form holds — or nothing, where it is not a
 * colour yet.
 *
 * An empty box is no colour rather than a half-typed one: it is the only way
 * back to a column with nothing in it, and there is nothing else it could be.
 *
 * The shorthand is only read once the box is left, because every six-digit
 * colour is typed through a three-digit one and the swatch would turn on the
 * way past.
 */
function asHex(text: string, settled: boolean): string | null | undefined {
  const typed = text.trim().toLowerCase();
  if (typed === "") return null;

  const digits = typed.startsWith("#") ? typed.slice(1) : typed;
  if (settled && /^[0-9a-f]{3}$/.test(digits)) {
    // `abc` is `aabbcc`: each digit stands for both of its pair.
    return `#${digits.replace(/./g, (one) => one + one)}`;
  }
  return /^[0-9a-f]{6}$/.test(digits) ? `#${digits}` : undefined;
}
