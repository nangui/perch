/**
 * The editor itself, which is where TipTap lives and the only place it does.
 *
 * This module is reached through a dynamic import and nothing else imports it,
 * so the bundler gives it a chunk of its own: a form with no rich editor on it
 * never fetches ProseMirror. The bundle budget is what enforces that — bundled
 * in, ProseMirror alone is more than half of what the panel is allowed.
 *
 * What the reader edits is a document, not a string of HTML — the same shape
 * the column keeps and the boundary judges, so nothing converts anywhere.
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { FieldStatus } from "../field-state.js";
import { isLocked } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import type { RichDocument, Tool } from "./rich-document.js";

export interface RichEditorSurfaceProps {
  readonly value: RichDocument | null;
  /** `null` is a document with nothing in it, and so a column with nothing in it. */
  readonly onValueChange: (value: RichDocument | null) => void;
  readonly toolbar: readonly Tool[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly label: string;
}

/** What each button says, and how to tell whether it is already on. */
const BUTTONS: Readonly<
  Record<Tool, { readonly label: string; readonly mark: string }>
> = {
  bold: { label: "Bold", mark: "bold" },
  italic: { label: "Italic", mark: "italic" },
  underline: { label: "Underline", mark: "underline" },
  strike: { label: "Strikethrough", mark: "strike" },
  code: { label: "Code", mark: "code" },
  h2: { label: "Heading", mark: "heading" },
  h3: { label: "Subheading", mark: "heading" },
  bulletList: { label: "Bulleted list", mark: "bulletList" },
  orderedList: { label: "Numbered list", mark: "orderedList" },
  blockquote: { label: "Quote", mark: "blockquote" },
  codeBlock: { label: "Code block", mark: "codeBlock" },
  link: { label: "Link", mark: "link" },
  rule: { label: "Divider", mark: "horizontalRule" },
};

/** What the button draws. Words, not icons: a glyph set is a later decision. */
const GLYPHS: Readonly<Record<Tool, string>> = {
  bold: "B",
  italic: "I",
  underline: "U",
  strike: "S",
  code: "‹›",
  h2: "H2",
  h3: "H3",
  bulletList: "•",
  orderedList: "1.",
  blockquote: "❝",
  codeBlock: "{ }",
  link: "🔗",
  rule: "—",
};

export function RichEditorSurface({
  value,
  onValueChange,
  toolbar,
  status,
  binding,
  label,
}: RichEditorSurfaceProps): ReactNode {
  const locked = isLocked(status);
  // What the column holds and this editor cannot draw. Set by the editor
  // itself, and what follows is a page nobody may type on.
  const [unreadable, setUnreadable] = useState(false);
  /**
   * The address being typed and the text it is for, or nothing while no link is
   * being made.
   *
   * A link is the one button that needs a second value, and the panel asks for
   * one on the page rather than in a dialog the browser draws and a sandboxed
   * frame refuses to. Asking takes the cursor out of the editor, so where the
   * link goes is written down when the button is pressed rather than looked up
   * afterwards, when the editor no longer has a selection to report.
   */
  const [asking, setAsking] = useState<{
    readonly from: number;
    readonly to: number;
    readonly address: string;
  } | null>(null);

  // The editor's callbacks are built once and keep the render they were built
  // in. What they need to know changes on every pass, so they read it here.
  const latest = useRef({ value, onValueChange, unreadable });
  latest.current = { value, onValueChange, unreadable };

  const editor = useEditor({
    // Only what the toolbar offers, so the editor cannot make a node the
    // boundary would refuse — the same list read on both sides.
    extensions: [
      StarterKit.configure({
        heading:
          toolbar.includes("h2") || toolbar.includes("h3")
            ? { levels: levels(toolbar) }
            : false,
        bulletList: toolbar.includes("bulletList") ? {} : false,
        orderedList: toolbar.includes("orderedList") ? {} : false,
        listItem:
          toolbar.includes("bulletList") || toolbar.includes("orderedList")
            ? {}
            : false,
        blockquote: toolbar.includes("blockquote") ? {} : false,
        codeBlock: toolbar.includes("codeBlock") ? {} : false,
        horizontalRule: toolbar.includes("rule") ? {} : false,
        bold: toolbar.includes("bold") ? {} : false,
        italic: toolbar.includes("italic") ? {} : false,
        strike: toolbar.includes("strike") ? {} : false,
        code: toolbar.includes("code") ? {} : false,
        underline: toolbar.includes("underline") ? {} : false,
        link: toolbar.includes("link") ? { openOnClick: false } : false,
      }),
    ],
    content: (value ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    }) as JSONContent,
    editable: !locked,
    /**
     * The document is checked against the schema rather than fed to it.
     *
     * A toolbar that loses a button loses the node it made, and a stored
     * document holding one is a document this editor cannot draw. Fed in, the
     * whole thing is discarded and the page comes up blank — and the next
     * keystroke is a valid document for the narrower toolbar, which the
     * boundary accepts and the column keeps. One line of somebody's form
     * emptying every record a reader opens.
     */
    enableContentCheck: true,
    onContentError: () => {
      setUnreadable(true);
    },
    editorProps: {
      attributes: {
        class: "perch-rich__page",
        id: binding.id,
        // The heading above, rather than a second copy of its words: one of
        // two copies is the one that stops matching.
        ...(binding["aria-labelledby"] === undefined
          ? { "aria-label": label }
          : { "aria-labelledby": binding["aria-labelledby"] }),
        "aria-describedby": binding["aria-describedby"],
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: made }) => {
      const now = latest.current;
      // A document nobody could draw is one this half has nothing to say
      // about: what the editor holds after refusing it is empty, and saying so
      // is how the column gets emptied.
      if (now.unreadable) return;

      const document = made.getJSON() as RichDocument;
      // An editor a reader has emptied answers with one empty paragraph, which
      // is a document. Sent as one, a column that may hold nothing never can
      // again — so nothing is what nothing is called.
      const next = blank(document) ? null : document;
      // Setting content is an update like any other, so the editor announces
      // the document it was just given the moment it is built. Announced, it
      // marks the form dirty and asks the server about a value it already has.
      if (same(next, now.value)) return;
      now.onValueChange(next);
    },
    // The server owns the state, so the editor is told rather than trusted to
    // have kept up.
    immediatelyRender: false,
  });

  /**
   * Which buttons are on, read from the editor rather than from a render.
   *
   * The editor keeps its own state and does not re-render React when it
   * changes. Without this the toolbar draws once and then says whatever was
   * true when the page loaded: press Bold, keep typing bold text, and every
   * button still reads "off".
   */
  const pressed = useEditorState({
    editor,
    selector: ({ editor: made }) =>
      made === null
        ? {}
        : Object.fromEntries(toolbar.map((tool) => [tool, isOn(made, tool)])),
  });

  useEffect(() => {
    if (editor === null) return;
    editor.setEditable(!locked && !unreadable);
  }, [editor, locked, unreadable]);

  /**
   * What the server last said, put back into the editor.
   *
   * The editor takes its content once and then keeps its own, which makes it a
   * second store nobody is reconciling: a save's answer, a hook that rewrites
   * the document, anything the server sends after the first render would be
   * drawn nowhere. Compared before it is set, because setting content moves the
   * cursor and the value echoed back after a keystroke is the one on screen.
   */
  useEffect(() => {
    if (editor === null || unreadable || value === null) return;
    if (same(editor.getJSON() as unknown, value)) return;
    editor.commands.setContent(value as JSONContent, { emitUpdate: false });
  }, [editor, value, unreadable]);

  if (editor === null) return null;

  if (unreadable) {
    // Left as it is rather than half-drawn: an empty page over a document that
    // exists is the shape of the mistake, not the fix.
    return (
      <div className="perch-rich perch-rich--unreadable" data-disabled="true">
        <p className="perch-rich__notice" role="status">
          This was written with formatting the field no longer offers, so it cannot be
          edited here. Nothing has been changed.
        </p>
      </div>
    );
  }

  return (
    <div className="perch-rich" data-disabled={locked ? "true" : "false"}>
      {toolbar.length === 0 ? null : (
        <div
          className="perch-rich__toolbar"
          role="toolbar"
          aria-label={`${label} formatting`}
        >
          {toolbar.map((tool) => (
            <button
              key={tool}
              type="button"
              className="perch-rich__tool"
              aria-label={BUTTONS[tool].label}
              aria-pressed={pressed?.[tool] === true}
              disabled={locked}
              // The editor keeps the selection only while it keeps focus, and a
              // button takes it away the moment it is pressed.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (tool !== "link") {
                  apply(editor, tool);
                  return;
                }
                // Pressed on a link, it takes the link off; pressed on text, it
                // asks where the text should go.
                if (editor.isActive("link")) {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  return;
                }
                const { from, to } = editor.state.selection;
                setAsking({ from, to, address: "" });
              }}
            >
              <span aria-hidden="true">{GLYPHS[tool]}</span>
            </button>
          ))}
        </div>
      )}
      {asking === null ? null : (
        /* A div rather than a form. This one is drawn inside the panel's own
           form, and a form inside a form is not a second form: pressing what
           looks like Apply submits the page instead, which saves the record. */
        <div className="perch-rich__link">
          <input
            type="url"
            className="perch-control perch-rich__address"
            aria-label="Address"
            placeholder="https://"
            value={asking.address}
            autoFocus
            onChange={(event) => {
              setAsking({ ...asking, address: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setAsking(null);
                editor.commands.focus();
                return;
              }
              if (event.key !== "Enter") return;
              // Enter in a box inside a form submits the form, and what this
              // one means is "this address, here".
              event.preventDefault();
              link(editor, asking);
              setAsking(null);
            }}
          />
          <button
            type="button"
            className="perch-button"
            onClick={() => {
              link(editor, asking);
              setAsking(null);
            }}
          >
            Apply
          </button>
          <button
            type="button"
            className="perch-button"
            onClick={() => {
              setAsking(null);
              editor.commands.focus();
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * The address, written to the range the cursor was in when it was asked for.
 *
 * Not to wherever the editor thinks it is now: the box that asked for the
 * address took the focus, and a command that reads the selection reads nothing.
 */
function link(
  editor: Editor,
  asking: { readonly from: number; readonly to: number; readonly address: string },
): void {
  const href = asking.address.trim();
  if (href === "") return;
  const range = { from: asking.from, to: asking.to };

  if (range.from === range.to) {
    // Nothing was selected, so there is no text to mark and the address becomes
    // the text — "put a link here".
    editor
      .chain()
      .focus()
      .insertContentAt(range, {
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run();
    return;
  }

  editor
    .chain()
    .focus()
    .setTextSelection(range)
    .extendMarkRange("link")
    .setLink({ href })
    .run();
}

/**
 * Two documents that say the same thing.
 *
 * Structural rather than `JSON.stringify`, because two objects with the same
 * entries in a different order are the same document and a text comparison
 * would call them different — and a difference here moves the reader's cursor.
 */
function same(one: unknown, other: unknown): boolean {
  if (one === other) return true;
  if (typeof one !== "object" || typeof other !== "object") return false;
  if (one === null || other === null) return false;

  if (Array.isArray(one) || Array.isArray(other)) {
    if (!Array.isArray(one) || !Array.isArray(other)) return false;
    return (
      one.length === other.length && one.every((at, index) => same(at, other[index]))
    );
  }

  const mine = Object.entries(one as Record<string, unknown>).filter(
    ([, held]) => held !== undefined,
  );
  const theirs = other as Record<string, unknown>;
  const count = Object.values(theirs).filter((held) => held !== undefined).length;
  return mine.length === count && mine.every(([key, held]) => same(held, theirs[key]));
}

/** A document with nothing written in it, whatever shape the editor gives it. */
function blank(document: RichDocument): boolean {
  const content = document.content ?? [];
  if (content.length === 0) return true;
  if (content.length > 1) return false;
  const only = content[0] as { type?: string; content?: readonly unknown[] };
  return only.type === "paragraph" && (only.content ?? []).length === 0;
}

function levels(toolbar: readonly Tool[]): (2 | 3)[] {
  const wanted: (2 | 3)[] = [];
  if (toolbar.includes("h2")) wanted.push(2);
  if (toolbar.includes("h3")) wanted.push(3);
  return wanted;
}

function isOn(editor: Editor, tool: Tool): boolean {
  if (tool === "h2") return editor.isActive("heading", { level: 2 });
  if (tool === "h3") return editor.isActive("heading", { level: 3 });
  return editor.isActive(BUTTONS[tool].mark);
}

function apply(editor: Editor, tool: Tool): void {
  const at = editor.chain().focus();
  switch (tool) {
    case "bold":
      at.toggleBold().run();
      return;
    case "italic":
      at.toggleItalic().run();
      return;
    case "underline":
      at.toggleUnderline().run();
      return;
    case "strike":
      at.toggleStrike().run();
      return;
    case "code":
      at.toggleCode().run();
      return;
    case "h2":
      at.toggleHeading({ level: 2 }).run();
      return;
    case "h3":
      at.toggleHeading({ level: 3 }).run();
      return;
    case "bulletList":
      at.toggleBulletList().run();
      return;
    case "orderedList":
      at.toggleOrderedList().run();
      return;
    case "blockquote":
      at.toggleBlockquote().run();
      return;
    case "codeBlock":
      at.toggleCodeBlock().run();
      return;
    case "rule":
      at.setHorizontalRule().run();
      return;
    case "link":
      // Handled where it is pressed: it is the one button that asks for a
      // second value before it can do anything.
      return;
  }
}
