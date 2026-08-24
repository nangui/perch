/**
 * Markdown, as far as the toolbar goes.
 *
 * A subset on purpose, and the same subset the buttons write: a preview that
 * draws less than the toolbar offers is a promise kept in one place and broken
 * in the other. Tables, footnotes and reference links are not here, and text
 * that uses them shows as the text it is — which is what a reader halfway
 * through a line should see anyway.
 *
 * What this returns is a tree, never a string of HTML. That is the whole
 * security argument: there is no `innerHTML` anywhere downstream, so a document
 * out of a column cannot carry a script, and nothing has to be sanitised
 * because nothing is ever parsed as markup. A link is the one exception, and it
 * is checked before it becomes an `href`.
 */

/** A run of text, with whatever emphasis was around it. */
export interface Span {
  readonly text: string;
  readonly bold?: true;
  readonly italic?: true;
  readonly strike?: true;
  readonly code?: true;
  /** Where it goes, already judged. Absent means it is not a link. */
  readonly href?: string;
}

export type Block =
  | { readonly kind: "paragraph"; readonly spans: readonly Span[] }
  | { readonly kind: "heading"; readonly level: 2 | 3; readonly spans: readonly Span[] }
  | { readonly kind: "quote"; readonly spans: readonly Span[] }
  | { readonly kind: "code"; readonly text: string }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly Span[])[];
    };

/** What a browser may be sent to. Anything else is drawn as plain text. */
function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (trimmed === "") return undefined;
  // A path on this site needs no scheme, and `//host` is another site wearing
  // one — the shape a check on `:` alone waves through.
  if (trimmed.startsWith("//")) return undefined;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (scheme === null) return trimmed;
  return ["http", "https", "mailto"].includes((scheme[1] ?? "").toLowerCase())
    ? trimmed
    : undefined;
}

const FENCE = /^```/;
const HEADING = /^(#{2,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/**
 * The document, as blocks.
 *
 * Line by line, because that is how markdown's block level works and because a
 * reader is typing: a parser that needs the whole document to be well formed
 * would flicker on every keystroke.
 */
export function parse(source: string): readonly Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: inline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? "";

    if (FENCE.test(line)) {
      flush();
      const held: string[] = [];
      at += 1;
      while (at < lines.length && !FENCE.test(lines[at] ?? "")) {
        held.push(lines[at] ?? "");
        at += 1;
      }
      blocks.push({ kind: "code", text: held.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1]?.length === 2 ? 2 : 3,
        spans: inline(heading[2] ?? ""),
      });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: "quote", spans: inline(quote[1] ?? "") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = numbered !== null;
      const item = inline(bullet?.[1] ?? numbered?.[1] ?? "");
      const last = blocks[blocks.length - 1];
      // Joined to the list above it where there is one of the same kind, so a
      // run of lines is one list rather than a list per line.
      if (last?.kind === "list" && last.ordered === ordered) {
        blocks[blocks.length - 1] = { ...last, items: [...last.items, item] };
      } else {
        blocks.push({ kind: "list", ordered, items: [item] });
      }
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}

/** Marks and links inside one line, innermost last. */
const MARKS: readonly { readonly pattern: RegExp; readonly span: Partial<Span> }[] = [
  { pattern: /`([^`]+)`/, span: { code: true } },
  // Shortest run that closes, so `**b *i* b**` is bold with italic inside it
  // rather than a stray asterisk and half a word.
  { pattern: /\*\*([\s\S]+?)\*\*/, span: { bold: true } },
  { pattern: /~~([\s\S]+?)~~/, span: { strike: true } },
  { pattern: /(?:\*([^*\n]+)\*|_([^_\n]+)_)/, span: { italic: true } },
];

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/;

/**
 * One line, as runs of text.
 *
 * Code first, because a backtick run means what it says and everything inside
 * it is text: `**bold**` inside backticks is four asterisks, not emphasis.
 *
 * The walk goes along the line rather than into what is left of it. Recursing
 * on the tail made the depth grow with the document, and a paragraph of eight
 * thousand emphasised words ran the browser out of stack — a document a column
 * can hold whatever the field declares. What recursion is left drops a rank
 * each time, so it stops after five.
 */
export function inline(line: string): readonly Span[] {
  const spans: Span[] = [];
  let rest = line;

  while (rest !== "") {
    const cut = firstCut(rest);
    if (cut === undefined) {
      spans.push({ text: rest });
      break;
    }
    // Appended rather than spread: a spread is one argument per span, and a
    // long enough line has more of those than a call can take.
    for (const span of inline(rest.slice(0, cut.at))) spans.push(span);
    for (const span of cut.spans) spans.push(span);
    rest = rest.slice(cut.at + cut.length);
  }

  return spans;
}

interface Cut {
  readonly at: number;
  readonly length: number;
  readonly spans: readonly Span[];
}

/**
 * The highest-ranked mark in the line, and what it stands for.
 *
 * Ranked rather than leftmost, so a backtick run anywhere wins over emphasis
 * everywhere. What comes before it therefore holds none of that rank, which is
 * what bounds the walk above.
 */
function firstCut(line: string): Cut | undefined {
  const code = MARKS[0];
  const found = code === undefined ? null : code.pattern.exec(line);
  if (found) {
    return {
      at: found.index,
      length: found[0].length,
      spans: [{ text: found[1] ?? "", code: true }],
    };
  }

  const link = LINK.exec(line);
  if (link) {
    const href = safeHref(link[2] ?? "");
    const text = link[1] ?? "";
    return {
      at: link.index,
      length: link[0].length,
      // A link that goes nowhere a browser may follow is its own text: a
      // reader sees what was written rather than a control that runs something.
      // Kept whole rather than read again — reading it again would find the
      // same link, and never stop.
      spans:
        href === undefined
          ? [{ text: link[0] }]
          : [{ text: text === "" ? href : text, href }],
    };
  }

  for (let rank = 1; rank < MARKS.length; rank += 1) {
    const mark = MARKS[rank];
    const match = mark === undefined ? null : mark.pattern.exec(line);
    if (match === null || mark === undefined) continue;
    return {
      at: match.index,
      length: match[0].length,
      spans: inline(match[1] ?? match[2] ?? "").map((span) => ({
        ...span,
        ...mark.span,
      })),
    };
  }

  return undefined;
}
