/**
 * What a rich editor holds, and what its toolbar may offer.
 *
 * Its own module because both halves need it and only one of them may carry
 * TipTap: the registry reads the tool names to decide what to draw, and reading
 * them from the editing surface would pull ProseMirror into the main bundle for
 * the sake of a list of thirteen words.
 */

/** Every button the editor knows, in the order a toolbar draws them. */
export const TOOLS = [
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
] as const;

export type Tool = (typeof TOOLS)[number];

/**
 * A document as the editor answers with one.
 *
 * Loosely typed on purpose: what is in it is the server's business, and this
 * half hands back exactly what it was given.
 */
export interface RichDocument {
  readonly type: string;
  readonly content?: readonly unknown[];
}
