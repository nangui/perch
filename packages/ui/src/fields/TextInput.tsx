/**
 * `TextInput` — the eight states and five flavours of the source design.
 *
 * Controlled, and deliberately so: the value comes from above, which is what
 * "the state is authoritative on the server" means at the component boundary.
 * The field never decides what it holds; it reports what the user did.
 *
 * The status marks — `Unsaved`, `Saving…`, the error badge — and the round-trip
 * hairline all live inside the control's own 34 px frame. Showing any of them
 * costs no layout, so a patch never shifts the fields below.
 */
import type { ChangeEvent, ReactNode } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";

/** Matches `TextFlavour` in `@perchjs/core`, which inference produces. */
export type TextFlavour = "text" | "email" | "password" | "url" | "numeric";

export interface TextInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly flavour?: TextFlavour;
  readonly placeholder?: string;
  readonly maxLength?: number;
  /**
   * Fixed, untypeable text inside the frame: `https://`, `@`, `.com`.
   *
   * Part of the box and not of the value — the column keeps what was typed.
   * Hidden from a screen reader, which reads the label and the hint instead:
   * an affix repeated into every field's name is noise, and one that carried
   * meaning of its own would need words, and those words are the hint.
   */
  readonly prefix?: string;
  /** A unit or a verification mark: `seats`, `✓`. */
  readonly suffix?: string;
  /** Glyphs beside them. Decoration, like the affixes themselves. */
  readonly prefixIcon?: string;
  readonly suffixIcon?: string;
  /** Marks the suffix as a confirmation rather than a unit. */
  readonly suffixOk?: boolean;
  /** Progress of the round trip, 0 to 1. Renders the hairline. */
  readonly progress?: number;
  readonly onRevealToggle?: () => void;
  readonly revealed?: boolean;
}

const INPUT_TYPE: Record<TextFlavour, string> = {
  text: "text",
  email: "email",
  password: "password",
  url: "text",
  numeric: "text",
};

/** Digits belong in a monospaced, tabular face so columns of them line up. */
const MONO_FLAVOURS = new Set<TextFlavour>(["password", "url", "numeric"]);

export function TextInput({
  value,
  onChange,
  status,
  binding,
  flavour = "text",
  placeholder,
  maxLength,
  prefix,
  prefixIcon,
  suffixIcon,
  suffix,
  suffixOk = false,
  progress,
  onRevealToggle,
  revealed = false,
}: TextInputProps): ReactNode {
  const locked = isLocked(status);
  const mono = MONO_FLAVOURS.has(flavour);
  const showTrack = progress !== undefined;

  return (
    <div
      className={`perch-control${showTrack ? " perch-control--tracked" : ""}`}
      {...statusAttributes(status)}
    >
      {prefixIcon === undefined && prefix === undefined ? null : (
        <span
          className="perch-control__affix perch-control__affix--prefix"
          aria-hidden="true"
        >
          {prefixIcon}
          {prefix}
        </span>
      )}

      <input
        {...binding}
        className="perch-control__input"
        data-mono={mono ? "true" : "false"}
        type={flavour === "password" && revealed ? "text" : INPUT_TYPE[flavour]}
        // `inputMode` rather than `type="number"`: a number input brings spinners,
        // silent locale parsing and a scroll-wheel trap. Numeric formatting is
        // the server's business anyway.
        {...(flavour === "numeric" ? { inputMode: "decimal" as const } : {})}
        {...(flavour === "password" ? { autoComplete: "new-password" } : {})}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value);
        }}
      />

      <StatusMark status={status} />

      {onRevealToggle === undefined ? null : (
        <button
          type="button"
          className="perch-control__affix perch-control__affix--button"
          onClick={onRevealToggle}
          aria-pressed={revealed}
          disabled={locked}
        >
          {revealed ? "hide" : "show"}
        </button>
      )}

      {suffix === undefined && suffixIcon === undefined ? null : (
        <span
          className={`perch-control__affix perch-control__affix--suffix${
            suffixOk ? " perch-control__affix--ok" : ""
          }`}
          aria-hidden="true"
        >
          {suffix}
          {suffixIcon}
        </span>
      )}

      {showTrack ? (
        <div
          className="perch-control__track"
          data-state={status.lifecycle}
          aria-hidden="true"
        >
          <div
            className={`perch-control__track-fill${
              status.lifecycle === "draft" ? " perch-control__track-fill--draft" : ""
            }`}
            style={{ width: `${String(Math.round(clamp01(progress) * 100))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * `Unsaved`, `Saving…` or the error badge — never two at once, because the
 * lifecycle is one value. Words rather than a spinner: "Saving…" says what is
 * happening, a spinner says only that something is.
 */
export function StatusMark({ status }: { readonly status: FieldStatus }): ReactNode {
  if (status.error !== undefined) {
    return (
      <span
        className="perch-control__mark perch-control__mark--error"
        aria-hidden="true"
      >
        !
      </span>
    );
  }
  if (status.lifecycle === "draft") {
    return (
      <span className="perch-control__mark perch-control__mark--draft">Unsaved</span>
    );
  }
  if (status.lifecycle === "inFlight") {
    return <span className="perch-control__mark">Saving…</span>;
  }
  return null;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
