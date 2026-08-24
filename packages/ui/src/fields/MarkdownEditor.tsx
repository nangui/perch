/**
 * `MarkdownEditor` — a box of text, and what it will look like.
 *
 * The box is a plain textarea: markdown is text, and the moment a field starts
 * intercepting keystrokes it owes the reader every shortcut their editor has.
 * The buttons write syntax into it rather than styling anything, which is why a
 * reader who ignores them entirely loses nothing.
 *
 * The preview draws a tree, never a string of markup. There is no `innerHTML`
 * anywhere in it, so a document out of a column cannot carry a script and
 * nothing needs sanitising — the one thing that could point somewhere is a
 * link, and it is judged before it becomes an `href`.
 */
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { countGraphemes } from "../graphemes.js";
import type { Block, Span } from "./markdown.js";
import { parse } from "./markdown.js";
import { StatusMark } from "./TextInput.js";

/** Every button this editor knows, in the order a toolbar draws them. */
export const TOOLS = [
  "bold",
  "italic",
  "strike",
  "code",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "link",
] as const;

export type Tool = (typeof TOOLS)[number];

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly toolbar: readonly Tool[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly label: string;
  readonly rows?: number;
  /**
   * Shows the count. The box is not clipped and the buttons do not stop: a
   * limit enforced in the browser hides what the reader wrote, and a button
   * that silently declined to write would be a button doing nothing. Over the
   * limit is an error state they can see, and the server is what refuses it.
   */
  readonly maxLength?: number;
  readonly placeholder?: string;
}

/** What each button says, and what it writes. */
const BUTTONS: Readonly<
  Record<Tool, { readonly label: string; readonly glyph: string }>
> = {
  bold: { label: "Bold", glyph: "B" },
  italic: { label: "Italic", glyph: "I" },
  strike: { label: "Strikethrough", glyph: "S" },
  code: { label: "Code", glyph: "‹›" },
  h2: { label: "Heading", glyph: "H2" },
  h3: { label: "Subheading", glyph: "H3" },
  bulletList: { label: "Bulleted list", glyph: "•" },
  orderedList: { label: "Numbered list", glyph: "1." },
  blockquote: { label: "Quote", glyph: "❝" },
  codeBlock: { label: "Code block", glyph: "{ }" },
  link: { label: "Link", glyph: "🔗" },
};

/** What goes on either side of the selection, or at the head of the line. */
const SYNTAX: Readonly<
  Record<Tool, { readonly wrap?: string; readonly head?: string; readonly link?: true }>
> = {
  bold: { wrap: "**" },
  italic: { wrap: "*" },
  strike: { wrap: "~~" },
  code: { wrap: "`" },
  h2: { head: "## " },
  h3: { head: "### " },
  bulletList: { head: "- " },
  orderedList: { head: "1. " },
  blockquote: { head: "> " },
  codeBlock: { wrap: "\n```\n" },
  link: { link: true },
};

export function MarkdownEditor({
  value,
  onValueChange,
  toolbar,
  status,
  binding,
  label,
  rows = 8,
  maxLength,
  placeholder,
}: MarkdownEditorProps): ReactNode {
  const [showing, setShowing] = useState<"write" | "preview">("write");
  const locked = isLocked(status);
  const length = useMemo(() => countGraphemes(value), [value]);

  /**
   * Writes syntax where the cursor is.
   *
   * Read off the element rather than kept here: the textarea is the one that
   * knows where the reader is, and a copy of the selection is a copy that goes
   * stale the moment they click.
   */
  function apply(tool: Tool, box: HTMLTextAreaElement): void {
    const from = box.selectionStart;
    const to = box.selectionEnd;
    const chosen = box.value.slice(from, to);
    const syntax = SYNTAX[tool];

    let written: string;
    let cursor: number;

    if (syntax.link === true) {
      const text = chosen === "" ? "text" : chosen;
      written = `[${text}](https://)`;
      cursor = from + written.length - 1;
    } else if (syntax.head !== undefined) {
      // At the head of the line the cursor is in, not at the selection: a
      // heading is a property of the line, and half a line cannot have one.
      const start = box.value.lastIndexOf("\n", from - 1) + 1;
      written = box.value.slice(start, to);
      const next = `${syntax.head}${written}`;
      onValueChange(box.value.slice(0, start) + next + box.value.slice(to));
      place(box, start + next.length);
      return;
    } else {
      const wrap = syntax.wrap ?? "";
      written = `${wrap}${chosen}${wrap}`;
      cursor = chosen === "" ? from + wrap.length : from + written.length;
    }

    onValueChange(box.value.slice(0, from) + written + box.value.slice(to));
    place(box, cursor);
  }

  return (
    <div className="perch-markdown" {...statusAttributes(status)}>
      <div className="perch-markdown__bar">
        {toolbar.length === 0 ? (
          <span />
        ) : (
          <div
            className="perch-markdown__tools"
            role="toolbar"
            aria-label={`${label} formatting`}
          >
            {toolbar.map((tool) => (
              <button
                key={tool}
                type="button"
                className="perch-markdown__tool"
                aria-label={BUTTONS[tool].label}
                disabled={locked || showing === "preview"}
                // The selection is the editor's, and a button takes the focus
                // away the moment it is pressed.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  const box = document.getElementById(binding.id);
                  if (box instanceof HTMLTextAreaElement) apply(tool, box);
                }}
              >
                <span aria-hidden="true">{BUTTONS[tool].glyph}</span>
              </button>
            ))}
          </div>
        )}

        {/* Two panels, one at a time, named as what they are rather than as
            what pressing them does: a reader reads the tab they are on. */}
        <div className="perch-markdown__panels" role="tablist" aria-label={label}>
          {(["write", "preview"] as const).map((panel) => (
            <button
              key={panel}
              id={`${binding.id}-${panel}-tab`}
              type="button"
              role="tab"
              aria-selected={showing === panel}
              aria-controls={`${binding.id}-${panel}`}
              className="perch-markdown__panel"
              onClick={() => {
                setShowing(panel);
              }}
            >
              {panel === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      {/* Both stay, and the one not shown is hidden rather than taken away.
          The label above this field points at the box by id: unmount it and
          the field loses its name for as long as the preview is up. Keeping it
          also keeps the cursor and the scroll where the reader left them. */}
      <div
        id={`${binding.id}-write`}
        role="tabpanel"
        aria-labelledby={`${binding.id}-write-tab`}
        hidden={showing !== "write"}
      >
        <textarea
          {...binding}
          className="perch-markdown__box"
          rows={rows}
          value={value}
          disabled={locked}
          {...(placeholder === undefined ? {} : { placeholder })}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
        />
        {maxLength === undefined ? null : (
          <div className="perch-markdown__footer">
            <span
              className={`perch-markdown__count${
                length > maxLength ? " perch-markdown__count--error" : ""
              }`}
            >
              {length} / {maxLength}
            </span>
          </div>
        )}
      </div>

      <div
        id={`${binding.id}-preview`}
        className="perch-markdown__preview"
        role="tabpanel"
        aria-labelledby={`${binding.id}-preview-tab`}
        hidden={showing !== "preview"}
      >
        {/* Built only while it is up: parsing the document on every keystroke
            of a panel nobody is looking at is work for nothing. */}
        {showing !== "preview" ? null : value.trim() === "" ? (
          <p className="perch-markdown__nothing">Nothing written yet.</p>
        ) : (
          parse(value).map((block, at) => <Drawn key={at} block={block} />)
        )}
      </div>
      <StatusMark status={status} />
    </div>
  );
}

/** Puts the cursor back where the writing left it, after React has redrawn. */
function place(box: HTMLTextAreaElement, at: number): void {
  requestAnimationFrame(() => {
    box.focus();
    box.setSelectionRange(at, at);
  });
}

function Drawn({ block }: { readonly block: Block }): ReactNode {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2>{spans(block.spans)}</h2>
      ) : (
        <h3>{spans(block.spans)}</h3>
      );
    case "quote":
      return <blockquote>{spans(block.spans)}</blockquote>;
    case "code":
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      return block.ordered ? (
        <ol>
          {block.items.map((item, at) => (
            <li key={at}>{spans(item)}</li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, at) => (
            <li key={at}>{spans(item)}</li>
          ))}
        </ul>
      );
    default:
      return <p>{spans(block.spans)}</p>;
  }
}

/** A run of text with its emphasis, innermost first. */
function spans(list: readonly Span[]): ReactNode {
  return list.map((span, at) => {
    let drawn: ReactNode = span.text;
    if (span.code === true) drawn = <code>{drawn}</code>;
    if (span.italic === true) drawn = <em>{drawn}</em>;
    if (span.bold === true) drawn = <strong>{drawn}</strong>;
    if (span.strike === true) drawn = <s>{drawn}</s>;
    // Already judged: what could not be followed never became one.
    if (span.href !== undefined) {
      drawn = (
        <a href={span.href} rel="noreferrer noopener" target="_blank">
          {drawn}
        </a>
      );
    }
    return <span key={at}>{drawn}</span>;
  });
}
