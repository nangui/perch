/**
 * `RichEditor` — a document, not a string of HTML.
 *
 * What the column keeps is the editor's own document: a tree of nodes and
 * marks. HTML would be the obvious choice and is the wrong one here, because
 * accepting HTML from a browser means sanitising HTML on the server, and the
 * one package that must import nothing is the one the trust boundary lives in.
 * A hand-written HTML sanitiser in that file is the last thing this repository
 * should contain.
 *
 * A tree needs no parser. Every node type and every mark is measured against
 * the toolbar the field declared — the same oracle pattern a select uses for
 * its options, one level deeper. What no button can produce is refused, which
 * is what makes a document from a client safe to keep.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";
import { safeHref } from "../entries/text-entry.js";

/**
 * What a toolbar may offer. Each one is a button, and each one admits exactly
 * the nodes or marks that button can make.
 */
export type RichEditorTool =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "link"
  | "rule";

export const RICH_EDITOR_TOOLS: readonly RichEditorTool[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "link",
  "rule",
];

/** Enough to write with, and not so much that the row of buttons wraps. */
const DEFAULT_TOOLBAR: readonly RichEditorTool[] = [
  "bold",
  "italic",
  "underline",
  "link",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "blockquote",
];

export interface RichEditorState extends FieldState {
  readonly toolbar: readonly RichEditorTool[];
}

/**
 * A forged document can nest as deep as its author cares to type, and a walk
 * that follows it runs out of stack. Deeper than this is not a document anybody
 * wrote: a blockquote inside a list inside a blockquote is four.
 */
const MAX_DEPTH = 20;

/** Nothing declares these and everything may hold them. */
const ALWAYS: ReadonlySet<string> = new Set(["paragraph", "text", "hardBreak"]);

/** What each button is able to put in the document. */
const NODES: Readonly<Record<string, readonly string[]>> = {
  h2: ["heading"],
  h3: ["heading"],
  bulletList: ["bulletList", "listItem"],
  orderedList: ["orderedList", "listItem"],
  blockquote: ["blockquote"],
  codeBlock: ["codeBlock"],
  rule: ["horizontalRule"],
};

const MARKS: Readonly<Record<string, readonly string[]>> = {
  bold: ["bold"],
  italic: ["italic"],
  underline: ["underline"],
  strike: ["strike"],
  code: ["code"],
  link: ["link"],
};

/** The attributes each node may carry. Anything else is not from a button. */
const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  heading: ["level"],
  codeBlock: ["language"],
  orderedList: ["start", "type"],
};

const MARK_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  link: ["href", "target", "rel", "class"],
};

export class RichEditor extends Field {
  declare readonly state: RichEditorState;

  override get type(): string {
    return "RichEditor";
  }

  protected override with(patch: Partial<RichEditorState>): this {
    return super.with(patch);
  }

  /** Typing is typing: it waits, like every other box of text. */
  protected override get defaultDebounce(): number {
    return 400;
  }

  static make(name: string): RichEditor {
    const state: RichEditorState = {
      ...baseFieldState(name),
      toolbar: DEFAULT_TOOLBAR,
    };
    return configured(new RichEditor(state));
  }

  /**
   * What the reader may do, which is also what the document may hold.
   *
   * One list, read twice: the browser draws these buttons and the boundary
   * admits what they make. A form that offers no italic is a form whose stored
   * documents have no italic in them, however the state arrives.
   */
  toolbar(value: readonly RichEditorTool[]): this {
    return this.with({ toolbar: [...value] });
  }

  /** The heading levels the two heading buttons stand for. */
  get #levels(): ReadonlySet<number> {
    const levels = new Set<number>();
    if (this.state.toolbar.includes("h2")) levels.add(2);
    if (this.state.toolbar.includes("h3")) levels.add(3);
    return levels;
  }

  get #nodes(): ReadonlySet<string> {
    const names = new Set<string>(ALWAYS);
    for (const tool of this.state.toolbar) {
      for (const node of NODES[tool] ?? []) names.add(node);
    }
    return names;
  }

  get #marks(): ReadonlySet<string> {
    const names = new Set<string>();
    for (const tool of this.state.toolbar) {
      for (const mark of MARKS[tool] ?? []) names.add(mark);
    }
    return names;
  }

  /**
   * A document, and nothing in it the toolbar cannot make.
   *
   * Everything is refused rather than stripped. A document arriving with a node
   * no button offers was not written on this page, and quietly removing the
   * node would save a document the reader never saw.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    if (!isDocument(value)) return "wrong-shape";

    const shape = {
      nodes: this.#nodes,
      marks: this.#marks,
      levels: this.#levels,
    };
    return walk(value.content ?? [], shape, 1) ? undefined : "wrong-shape";
  }

  /**
   * The column's document.
   *
   * A `Json` column reaches this as an object and a text column holding the
   * same document reaches it as the text of one; both are the document, and
   * the half above this should not have to ask which.
   */
  override fromStorage(value: unknown): unknown {
    if (typeof value !== "string" || value.trim() === "") return value;
    try {
      const parsed: unknown = JSON.parse(value);
      return isDocument(parsed) ? parsed : value;
    } catch {
      // Not JSON, so not a document this field wrote. Left alone for the
      // boundary to refuse, which says more than an empty page would.
      return value;
    }
  }
}

interface Document {
  readonly type: "doc";
  readonly content?: readonly unknown[];
}

function isDocument(value: unknown): value is Document {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const { type, content } = value as Record<string, unknown>;
  if (type !== "doc") return false;
  return content === undefined || Array.isArray(content);
}

interface Shape {
  readonly nodes: ReadonlySet<string>;
  readonly marks: ReadonlySet<string>;
  readonly levels: ReadonlySet<number>;
}

/** True when every node below here is one the toolbar can make. */
function walk(content: readonly unknown[], shape: Shape, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  return content.every((node) => admitsNode(node, shape, depth));
}

function admitsNode(node: unknown, shape: Shape, depth: number): boolean {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  const { type, attrs, marks, text, content } = node as Record<string, unknown>;
  if (typeof type !== "string" || !shape.nodes.has(type)) return false;

  if (type === "text") {
    if (typeof text !== "string") return false;
    if (content !== undefined) return false;
  } else if (text !== undefined) {
    return false;
  }

  if (!admitsAttributes(type, attrs, shape)) return false;
  if (!admitsMarks(marks, shape)) return false;

  if (content === undefined) return true;
  return Array.isArray(content) && walk(content, shape, depth + 1);
}

function admitsAttributes(type: string, attrs: unknown, shape: Shape): boolean {
  if (attrs !== undefined && attrs !== null) {
    if (typeof attrs !== "object" || Array.isArray(attrs)) return false;
    const allowed = ATTRIBUTES[type] ?? [];
    // `null` is the editor saying it did not use that one, which every node it
    // makes carries for every attribute it knows of and left alone.
    for (const [name, held] of Object.entries(attrs)) {
      if (held !== null && !allowed.includes(name)) return false;
    }
  }

  // A heading is the one node whose attribute says which button made it, so it
  // is the one that has to have one.
  if (type !== "heading") return true;
  const level = (attrs as { level?: unknown } | null | undefined)?.level;
  return typeof level === "number" && shape.levels.has(level);
}

function admitsMarks(marks: unknown, shape: Shape): boolean {
  if (marks === undefined) return true;
  if (!Array.isArray(marks)) return false;

  return marks.every((mark) => {
    if (typeof mark !== "object" || mark === null || Array.isArray(mark)) return false;
    const { type, attrs } = mark as Record<string, unknown>;
    if (typeof type !== "string" || !shape.marks.has(type)) return false;
    if (attrs === undefined || attrs === null) return type !== "link";
    if (typeof attrs !== "object" || Array.isArray(attrs)) return false;

    const allowed = MARK_ATTRIBUTES[type] ?? [];
    for (const [name, held] of Object.entries(attrs)) {
      if (held === null) continue;
      if (!allowed.includes(name)) return false;
      if (typeof held !== "string") return false;
    }
    // The one attribute that is an instruction to a browser rather than a
    // description of text: a `javascript:` link is a script the panel stored.
    // Asked of the reader an entry's own address goes through, which puts the
    // question to the parser a browser uses rather than to a pattern.
    if (type !== "link") return true;
    return safeHref((attrs as { href?: unknown }).href) !== undefined;
  });
}
