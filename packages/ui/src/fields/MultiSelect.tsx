/**
 * A select that takes several values.
 *
 * Radix's `Select` holds one value and closes on choosing it, which are both
 * wrong here, so this is a listbox in a `Popover` — the same shell the
 * searchable select uses, with none of its machinery: no term, no debounce, no
 * request in flight. The options arrive with the form and that is all there is.
 *
 * Choosing does not close it. Someone picking three things should not reopen
 * the list twice, and the close is what makes a multi-select feel broken.
 *
 * The listbox says `aria-multiselectable`, and every option carries its own
 * `aria-selected` — including the ones that are not selected. Marking only the
 * chosen ones leaves a screen reader unable to say what it would be choosing.
 */
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "./marks.js";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface MultiSelectProps {
  readonly value: readonly string[];
  readonly onValueChange: (value: readonly string[]) => void;
  readonly options: readonly MultiSelectOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly placeholder?: string;
  /** Names the list. The field's own label. */
  readonly label: string;
}

export function MultiSelect({
  value,
  onValueChange,
  options,
  status,
  binding,
  placeholder = "Select…",
  label,
}: MultiSelectProps): ReactNode {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const chosen = new Set(value);
  const locked = isLocked(status);

  function toggle(option: MultiSelectOption): void {
    onValueChange(
      chosen.has(option.value)
        ? value.filter((held) => held !== option.value)
        : [...value, option.value],
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at) => (at + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined) toggle(option);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : options.length - 1);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="perch-control"
          {...statusAttributes(status)}
          id={binding.id}
          aria-describedby={binding["aria-describedby"]}
          aria-invalid={binding["aria-invalid"]}
          aria-required={binding["aria-required"]}
          aria-haspopup="listbox"
          disabled={locked}
        >
          {/* Never blanked when disabled: the selection is what the reader
              needs to see in order to ask why they cannot change it. */}
          <span
            style={
              value.length === 0 ? { color: "var(--perch-content-subtle)" } : undefined
            }
          >
            {summarise(value, options, placeholder)}
          </span>
          <StatusMark status={status} />
          <span className="perch-select__chevron" aria-hidden="true">
            <ChevronDown />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="perch-popover"
          sideOffset={4}
          style={{ minWidth: "var(--radix-popover-trigger-width)" }}
          onOpenAutoFocus={(event) => {
            // The list, not the content: the arrows are handled there, and
            // Radix would otherwise leave focus on a wrapper that ignores them.
            event.preventDefault();
            listRef.current?.focus();
          }}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            tabIndex={-1}
            className="perch-combobox__list"
            {...(options[active] === undefined
              ? {}
              : { "aria-activedescendant": `${listId}-${String(active)}` })}
            onKeyDown={onKeyDown}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={chosen.has(option.value)}
                data-active={index === active ? "true" : undefined}
                className="perch-option"
                onMouseDown={(event) => {
                  // Kept off the list's focus, or the popover closes under the
                  // reader before their second choice.
                  event.preventDefault();
                  toggle(option);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
              >
                <span className="perch-option__check" aria-hidden="true">
                  {chosen.has(option.value) ? "✓" : ""}
                </span>
                {option.label}
              </li>
            ))}
          </ul>

          {options.length > 0 ? null : (
            <p className="perch-combobox__empty">Nothing to choose from</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * One choice reads better as itself than as a count, and a long list reads
 * better as a count than as a sentence nobody finishes.
 */
function summarise(
  value: readonly string[],
  options: readonly MultiSelectOption[],
  placeholder: string,
): string {
  if (value.length === 0) return placeholder;
  if (value.length === 1) {
    const only = options.find((option) => option.value === value[0]);
    return only?.label ?? String(value[0]);
  }
  return `${String(value.length)} selected`;
}
