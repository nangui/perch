/**
 * `MarkdownEditor` — text that is already what it means.
 *
 * The opposite decision from the rich editor, and for the opposite reason. That
 * one keeps a document because HTML from a browser would have to be sanitised
 * on the server, and the package the boundary lives in may not import a
 * sanitiser. Markdown needs none of that: it is text in the column, text on the
 * wire, text in the box. What it means is decided when it is drawn, and drawing
 * is the browser's half.
 *
 * So there is nothing here to convert and nothing to walk. What the field says
 * is how tall the box starts, how much it takes, and which buttons the page
 * offers — and that last list is the same one twice, because a button that
 * writes syntax the preview does not draw is a button that writes noise.
 */
import { configured } from "../component.js";
import type { FieldState, ValidationRule, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset, lengthRules } from "../field.js";

/**
 * What a toolbar may offer, which is also what the preview knows how to draw.
 *
 * Deliberately short. Markdown has a long tail — tables, footnotes, references —
 * and a preview that draws a subset while the toolbar offers the whole is a
 * promise kept in one place and broken in the other.
 */
export type MarkdownTool =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "link";

export const MARKDOWN_TOOLS: readonly MarkdownTool[] = [
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
];

/** Enough to write with, and not so much that the row of buttons wraps. */
const DEFAULT_TOOLBAR: readonly MarkdownTool[] = [
  "bold",
  "italic",
  "link",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
];

export interface MarkdownEditorState extends FieldState {
  readonly toolbar: readonly MarkdownTool[];
  /** How tall the box starts. A floor: long text still scrolls. */
  readonly rows?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export class MarkdownEditor extends Field {
  declare readonly state: MarkdownEditorState;

  override get type(): string {
    return "MarkdownEditor";
  }

  protected override with(patch: Partial<MarkdownEditorState>): this {
    return super.with(patch);
  }

  /** Typing is typing: it waits, like every other box of text. */
  protected override get defaultDebounce(): number {
    return 400;
  }

  static make(name: string): MarkdownEditor {
    const state: MarkdownEditorState = {
      ...baseFieldState(name),
      toolbar: DEFAULT_TOOLBAR,
    };
    return configured(new MarkdownEditor(state));
  }

  /**
   * Which buttons the page offers.
   *
   * Unlike a rich editor's, this list does not close the document: a reader can
   * type any markdown they like into the box, and the column holds text either
   * way. What it does is decide what the page helps with — and the preview
   * draws exactly this list, so the two cannot disagree.
   */
  toolbar(value: readonly MarkdownTool[]): this {
    return this.with({ toolbar: [...value] });
  }

  rows(value: number): this {
    return this.with({ rows: value });
  }

  minLength(value: number): this {
    return this.with({ minLength: value });
  }

  maxLength(value: number): this {
    return this.with({ maxLength: value });
  }

  override get declaredRules(): readonly ValidationRule[] {
    return lengthRules(this.state.minLength, this.state.maxLength);
  }

  /**
   * Text, and nothing else.
   *
   * There is no shape to check beyond that: markdown that says nothing a
   * renderer recognises is markdown that draws as the text it is, which is what
   * a reader typing `> ` halfway through a thought should see.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return typeof value === "string" ? undefined : "wrong-shape";
  }
}
