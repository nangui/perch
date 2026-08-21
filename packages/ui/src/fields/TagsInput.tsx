/**
 * `TagsInput` — a list the reader writes.
 *
 * One text box and the tags already made, each with a way to take it off. The
 * box commits on Enter and on the separator the field declared, so a reader
 * pasting `a,b,c` into a comma-separated field gets three tags rather than one
 * containing commas — which the server would refuse.
 *
 * Backspace on an empty box takes the last tag back. It is the one gesture
 * people arrive expecting from every other tags field they have used, and
 * without it the only way back is the pointer.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface TagsInputProps {
  /** What is on the list. Never `null`: no tags is an empty list. */
  readonly value: readonly string[];
  readonly onValueChange: (value: readonly string[]) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Names the set of tags for a reader who is not looking at it. */
  readonly label: string;
  readonly placeholder?: string;
  /** What the column joins on, where it joins. Also commits while typing. */
  readonly separator?: string;
  /** Offered while typing. Proposals, never a set to be measured against. */
  readonly suggestions?: readonly string[];
}

export function TagsInput({
  value,
  onValueChange,
  status,
  binding,
  label,
  placeholder,
  separator,
  suggestions,
}: TagsInputProps): ReactNode {
  const [typed, setTyped] = useState("");
  const list = useId();
  const locked = isLocked(status);

  /**
   * What the box holds, as tags.
   *
   * Split on the separator as well as committed whole, so a pasted line
   * arrives as the tags it stands for. Blanks and repeats are dropped here
   * rather than sent: the server refuses both, and a reader typing a tag they
   * already have should see nothing happen rather than an error.
   */
  function commit(text: string): void {
    const parts = separator === undefined ? [text] : text.split(separator);
    const fresh = parts.map((one) => one.trim()).filter((one) => one !== "");
    if (fresh.length === 0) {
      setTyped("");
      return;
    }

    const next = [...value];
    for (const one of fresh) if (!next.includes(one)) next.push(one);
    setTyped("");
    // Silence where nothing was added. A reader retyping a tag they already
    // have should see the box clear and nothing else happen — announcing a
    // change that did not happen marks the form dirty and asks the server
    // about a value it already has.
    if (next.length !== value.length) onValueChange(next);
  }

  function press(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || (separator !== undefined && event.key === separator)) {
      // Enter would submit the form around it, and the separator would land in
      // the box as a character rather than ending the tag.
      event.preventDefault();
      commit(typed);
      return;
    }
    if (event.key === "Backspace" && typed === "" && value.length > 0) {
      onValueChange(value.slice(0, -1));
    }
  }

  return (
    <div className="perch-tags" {...statusAttributes(status)}>
      {value.length === 0 ? null : (
        // A list, because that is what it is: a screen reader is told how many
        // tags there are before it starts reading them out.
        <ul className="perch-tags__list" aria-label={label}>
          {value.map((tag) => (
            <li className="perch-tags__tag" key={tag}>
              <span className="perch-tags__text">{tag}</span>
              <button
                type="button"
                className="perch-tags__remove"
                aria-label={`Remove ${tag}`}
                disabled={locked}
                onClick={() => {
                  onValueChange(value.filter((one) => one !== tag));
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        {...binding}
        type="text"
        className="perch-control perch-tags__input"
        value={typed}
        placeholder={placeholder}
        {...(suggestions === undefined || suggestions.length === 0 ? {} : { list })}
        onChange={(event) => {
          const text = event.target.value;
          // A separator typed or pasted mid-word ends the tag there, so the
          // character never reaches the value the server would refuse.
          if (separator !== undefined && text.includes(separator)) commit(text);
          else setTyped(text);
        }}
        onKeyDown={press}
        // What is in the box when focus leaves is a tag the reader meant:
        // losing it to a click elsewhere is the complaint every tags field
        // that does not do this receives.
        onBlur={() => {
          commit(typed);
        }}
      />

      {suggestions === undefined || suggestions.length === 0 ? null : (
        <datalist id={list}>
          {suggestions.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>
      )}
      <StatusMark status={status} />
    </div>
  );
}
