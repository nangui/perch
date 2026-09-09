/**
 * A select whose list is a window onto something larger.
 *
 * Radix's `Select` cannot host this: it owns the keyboard inside its content
 * for typeahead, so a text input there receives half of what is typed. A
 * combobox is a different pattern with different roles, and it is built here on
 * `Popover` rather than bent out of `Select`.
 *
 * The searching happens on the server. Filtering ten thousand options in the
 * browser is the bug this exists to avoid, so nothing here narrows a list — it
 * asks for one and renders the answer.
 *
 * The listbox is never focused. Focus stays in the input and the active option
 * is named by `aria-activedescendant`, which is what lets someone type and
 * choose without leaving the field.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "./marks.js";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface SearchableOption {
  readonly value: string;
  readonly label: string;
}

export interface SearchableSelectProps {
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  /** What the server sent with the form: the window, before any typing. */
  readonly options: readonly SearchableOption[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly placeholder?: string;
  /** Names the search box. The field's own label, not its id. */
  readonly label: string;
  /** Asks the server. Returning nothing is a legitimate answer, not a failure. */
  readonly search: (term: string) => Promise<readonly SearchableOption[]>;
  /** How long to wait after a keystroke. A test can drop it to zero. */
  readonly debounce?: number;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  status,
  binding,
  placeholder = "Select…",
  label: fieldLabel,
  search,
  debounce = 250,
}: SearchableSelectProps): ReactNode {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [shown, setShown] = useState(options);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only the newest answer may land. Without this a slow request for "ad"
  // arriving after "ada" replaces the narrower list with the wider one, and the
  // reader watches their own typing come undone.
  const latest = useRef(0);

  // The window is whatever the server last sent, and it may send another while
  // this is open — a dependent select whose parent just changed. An untyped box
  // shows the newest one rather than the one it opened with.
  useEffect(() => {
    if (term.trim() !== "") return;
    // Advanced here too, or a search still in flight lands afterwards and
    // replaces the window the reader asked to come back to.
    latest.current += 1;
    setShown(options);
    setFailed(false);
    setBusy(false);
  }, [options, term]);

  useEffect(() => {
    if (!open) return;
    const wanted = term.trim();
    if (wanted === "") return;

    const sequence = latest.current + 1;
    latest.current = sequence;

    const timer = setTimeout(() => {
      setBusy(true);
      search(wanted)
        .then(
          (answer) => {
            if (latest.current !== sequence) return;
            setShown(answer);
            setFailed(false);
          },
          () => {
            if (latest.current !== sequence) return;
            // The list stands rather than emptying: a failed request is not the
            // same answer as "nothing matched", and showing one as the other
            // tells the reader their search worked when it did not.
            setFailed(true);
          },
        )
        .finally(() => {
          if (latest.current === sequence) setBusy(false);
        });
    }, debounce);

    return () => {
      clearTimeout(timer);
    };
  }, [term, open, search, debounce]);

  useEffect(() => {
    setActive(0);
  }, [shown]);

  const choose = useCallback(
    (option: SearchableOption) => {
      onValueChange(option.value);
      setOpen(false);
      setTerm("");
    },
    [onValueChange],
  );

  const locked = isLocked(status);
  const selected = options.find((option) => option.value === value);
  const shownLabel = selected?.label ?? value ?? placeholder;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at) => (at + step + shown.length) % shown.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[active];
      if (option !== undefined) choose(option);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : shown.length - 1);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="perch-control"
          {...statusAttributes(status)}
          id={binding.id}
          aria-describedby={binding["aria-describedby"]}
          aria-invalid={binding["aria-invalid"]}
          aria-required={binding["aria-required"]}
          // Radix says `dialog`, which is what its own popover is. What is in
          // this one is a list, and that is what the reader is about to meet.
          aria-haspopup="listbox"
          disabled={locked}
        >
          {/* Never blanked when disabled — the value is what the reader needs
              to see in order to ask why they cannot change it. */}
          <span
            style={
              selected === undefined && value === null
                ? { color: "var(--perch-content-subtle)" }
                : undefined
            }
          >
            {shownLabel}
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
            // Radix would focus the content; the input is where typing has to
            // land, and moving focus afterwards is a visible flicker.
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            className="perch-control perch-combobox__input"
            value={term}
            placeholder="Search…"
            autoComplete="off"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={`Search ${fieldLabel}`}
            {...(shown[active] === undefined
              ? {}
              : { "aria-activedescendant": `${listId}-${String(active)}` })}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
            onKeyDown={onKeyDown}
          />

          {/* Announced, not silent: a reader who cannot see the list going
              stale has no other way to learn a request is in flight. */}
          <span className="perch-combobox__status" role="status">
            {busy ? "Searching…" : ""}
          </span>

          <ul id={listId} role="listbox" className="perch-combobox__list">
            {shown.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === active ? "true" : undefined}
                className="perch-option"
                // `onMouseDown`, not `onClick`: a click first blurs the input,
                // which closes the popover before the choice is made.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>

          {shown.length > 0 ? null : (
            <p className="perch-combobox__empty">
              {failed ? "Could not search just now" : "Nothing matched"}
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
