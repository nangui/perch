/**
 * `Select` — Radix Select, styled, plus the three moments of a dependent field.
 *
 * This is the component milestone A1 exercises: a "city" select whose options
 * depend on a "country" select. The design's requirement for it is one sentence —
 * *"Identical height in all three, so the fields below never move"* — and it is
 * the reason `awaiting`, `loading` and ready are rendered by the same 34 px
 * control rather than by three different shapes.
 *
 * Two behaviours are stated by the design and enforced here rather than left to
 * the caller:
 *   - disabled keeps its value visible, never blanked;
 *   - when no options exist, the field stays present and disabled rather than
 *     disappearing. A field that vanishes is a field the user cannot ask about.
 */
import type { ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** Right-aligned annotation: a price, a duration, a code. */
  readonly meta?: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly placeholder?: string;
  /**
   * A dependency is not satisfied yet — the parent field is empty. Distinct from
   * `loading`, which means the request is in flight, and from an empty option
   * list, which means the server answered with nothing.
   */
  readonly awaiting?: string;
  /** Shown when the option list is legitimately empty for this parent value. */
  readonly emptyLabel?: string;
}

/**
 * Whether a value coming out of the control is a choice somebody made.
 *
 * The underlying control forbids an item whose value is the empty string, so an
 * empty string is never one: it is the control clearing itself, which it does
 * when the list changes underneath a value it has not drawn yet — precisely
 * what happens when a row is created from the dialog beside it. Passing that on
 * reports a choice nobody made, and undoes the one the server had just settled.
 */
export function reportable(value: string): boolean {
  return value !== "";
}

export function Select({
  value,
  onValueChange,
  options,
  status,
  binding,
  placeholder = "Select…",
  awaiting,
  emptyLabel,
}: SelectProps): ReactNode {
  // Three ways to be unusable, three different things to say. Collapsing them
  // into one "disabled" is what makes dependent selects feel broken.
  if (awaiting !== undefined) {
    return (
      <StaticControl status={status} binding={binding} muted>
        {awaiting}
      </StaticControl>
    );
  }

  if (status.lifecycle === "loading") {
    return (
      <div
        className="perch-control"
        {...statusAttributes(status)}
        aria-busy="true"
        role="status"
      >
        {/* A skeleton the width of a plausible value, not a spinner: the box keeps
            its height, so nothing below it moves when the options land. */}
        <span className="perch-skeleton" style={{ width: "92px" }} aria-hidden="true" />
        <span className="perch-loading-note">Loading options…</span>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <StaticControl status={{ ...status, disabled: true }} binding={binding} empty>
        {emptyLabel ?? "No options available"}
      </StaticControl>
    );
  }

  const locked = isLocked(status);
  const selected = options.find((o) => o.value === value);

  return (
    <RadixSelect.Root
      // Spread rather than `value={value ?? undefined}`: Radix declares
      // `value?: string`, and under `exactOptionalPropertyTypes` an explicit
      // `undefined` is not the same as an absent prop.
      {...(value === null ? {} : { value })}
      onValueChange={(next) => {
        if (reportable(next)) onValueChange(next);
      }}
      disabled={locked}
    >
      <RadixSelect.Trigger
        className="perch-control"
        {...statusAttributes(status)}
        id={binding.id}
        aria-describedby={binding["aria-describedby"]}
        aria-invalid={binding["aria-invalid"]}
        aria-required={binding["aria-required"]}
      >
        {/* Never blanked when disabled — the design is explicit about it. */}
        <RadixSelect.Value placeholder={placeholder}>
          {selected?.label ?? value ?? placeholder}
        </RadixSelect.Value>
        <StatusMark status={status} />
        <RadixSelect.Icon className="perch-select__chevron">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className="perch-popover"
          position="popper"
          sideOffset={4}
          style={{ minWidth: "var(--radix-select-trigger-width)" }}
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled ?? false}
                className="perch-option"
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                {option.meta === undefined ? null : (
                  <span className="perch-option__meta">{option.meta}</span>
                )}
                <span className="perch-option__check" aria-hidden="true">
                  <RadixSelect.ItemIndicator>✓</RadixSelect.ItemIndicator>
                </span>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

/**
 * A control-shaped box that is not a control: same height, same radius, no
 * interaction. Used for "select a country first" and "no tax region for this
 * country" — both cases where the field must hold its place in the layout.
 */
function StaticControl({
  status,
  binding,
  children,
  muted = false,
  empty = false,
}: {
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly children: ReactNode;
  readonly muted?: boolean;
  readonly empty?: boolean;
}): ReactNode {
  return (
    // A button, not a div: `<label for>` can only label a labelable element, so a
    // div here left the field with no accessible name at all — a screen-reader
    // user never heard "Select a country first".
    //
    // `aria-disabled` rather than `disabled`: a disabled button is removed from
    // the tab order, and a field that cannot be used is precisely the one a user
    // needs to reach to find out why. It is focusable and announced, and does
    // nothing when activated.
    <button
      type="button"
      className="perch-control"
      style={{ textAlign: "left", cursor: "not-allowed" }}
      {...statusAttributes({ ...status, disabled: true })}
      {...(empty ? { "data-empty": "true" } : {})}
      id={binding.id}
      aria-describedby={binding["aria-describedby"]}
      aria-disabled="true"
      onClick={(event) => {
        event.preventDefault();
      }}
    >
      <span
        style={muted || empty ? { color: "var(--perch-content-subtle)" } : undefined}
      >
        {children}
      </span>
      {empty ? null : (
        <span className="perch-select__chevron" aria-hidden="true">
          ▾
        </span>
      )}
    </button>
  );
}
