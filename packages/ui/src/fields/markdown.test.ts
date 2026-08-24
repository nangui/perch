/**
 * What the preview understands, and what it refuses to.
 *
 * The parser returns a tree, never a string of markup, so a document out of a
 * column cannot carry a script — there is nothing downstream that parses
 * anything as HTML. What is left to test is the one value that does point
 * somewhere, and the shape of what a reader typing half a line should see.
 */
import { describe, expect, it } from "vitest";
import { inline, parse } from "./markdown.js";

describe("blocks", () => {
  it("reads a paragraph, and joins the lines it is written on", () => {
    expect(parse("one\ntwo")).toEqual([
      { kind: "paragraph", spans: [{ text: "one two" }] },
    ]);
  });

  it("separates paragraphs on a blank line", () => {
    expect(parse("one\n\ntwo").map((block) => block.kind)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  it("reads the two headings the toolbar writes, and no others", () => {
    expect(parse("## Two")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Two" }] },
    ]);
    expect(parse("### Three")[0]).toMatchObject({ kind: "heading", level: 3 });
    // `#` is not on the toolbar, so it is not in the preview: a page heading
    // inside a field is a heading that fights the page's own.
    expect(parse("# One")[0]).toMatchObject({ kind: "paragraph" });
  });

  it("reads a quote", () => {
    expect(parse("> said")).toEqual([{ kind: "quote", spans: [{ text: "said" }] }]);
  });

  it("gathers a run of items into one list", () => {
    expect(parse("- one\n- two")).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [[{ text: "one" }], [{ text: "two" }]],
      },
    ]);
  });

  it("keeps an ordered list apart from a bulleted one", () => {
    expect(parse("- one\n1. two").map((block) => block.kind)).toEqual(["list", "list"]);
  });

  it("reads a fenced block as the text it is", () => {
    // Everything inside is text, including what looks like markdown.
    expect(parse("```\n**not bold**\n```")).toEqual([
      { kind: "code", text: "**not bold**" },
    ]);
  });

  it("reads an unclosed fence as everything after it", () => {
    // A reader typing one has not made a mistake, and a preview that gives up
    // on the whole document until they close it is a preview that flickers.
    expect(parse("```\nstill typing")).toEqual([
      { kind: "code", text: "still typing" },
    ]);
  });
});

describe("marks inside a line", () => {
  it("reads bold, italic, strikethrough and code", () => {
    expect(inline("**b**")).toEqual([{ text: "b", bold: true }]);
    expect(inline("*i*")).toEqual([{ text: "i", italic: true }]);
    expect(inline("_i_")).toEqual([{ text: "i", italic: true }]);
    expect(inline("~~s~~")).toEqual([{ text: "s", strike: true }]);
    expect(inline("`c`")).toEqual([{ text: "c", code: true }]);
  });

  it("keeps what is around them", () => {
    expect(inline("a **b** c")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " c" },
    ]);
  });

  it("reads one inside another", () => {
    expect(inline("**b *i* b**")).toEqual([
      { text: "b ", bold: true },
      { text: "i", italic: true, bold: true },
      { text: " b", bold: true },
    ]);
  });

  it("leaves what is in backticks alone", () => {
    // `**bold**` inside code is four asterisks, not emphasis.
    expect(inline("`**b**`")).toEqual([{ text: "**b**", code: true }]);
  });

  it("says nothing about syntax that was never closed", () => {
    expect(inline("**half a thought")).toEqual([{ text: "**half a thought" }]);
  });
});

describe("a document longer than anyone means to write", () => {
  // The column holds what it holds: a field may declare no length at all, and
  // an import or a migration answers to nothing the form said. Walking into
  // what was left of the line made the depth grow with the document, and this
  // shape ran the browser out of stack at about eight thousand.
  const many = 10_000;

  it("is read to the end", () => {
    expect(inline("**a** ".repeat(many))).toHaveLength(many * 2);
  });

  it("is read to the end when what wins comes last", () => {
    // The other half of the same walk: a backtick run at the far end makes
    // everything before it one call, whose answer comes back all at once.
    expect(inline(`${"**a** ".repeat(many)}\`c\``)).toHaveLength(many * 2 + 1);
  });
});

describe("a link", () => {
  it("goes where a browser may follow", () => {
    expect(inline("[here](https://example.com)")).toEqual([
      { text: "here", href: "https://example.com" },
    ]);
    expect(inline("[here](/people/1)")).toEqual([{ text: "here", href: "/people/1" }]);
    expect(inline("[here](mailto:ada@example.com)")).toEqual([
      { text: "here", href: "mailto:ada@example.com" },
    ]);
  });

  it("is drawn as its own text where it does not", () => {
    // The one value in a document that points somewhere. A reader sees what
    // was written rather than a control that runs something.
    expect(inline("[here](javascript:alert(1)")).toEqual([
      { text: "[here](javascript:alert(1)" },
    ]);
    expect(inline("[here](javascript:alert)")).toEqual([
      { text: "[here](javascript:alert)" },
    ]);
    expect(inline("[here](//example.com)")).toEqual([
      { text: "[here](//example.com)" },
    ]);
  });

  it("shows the address where there is nothing to call it", () => {
    expect(inline("[](https://example.com)")).toEqual([
      { text: "https://example.com", href: "https://example.com" },
    ]);
  });
});
