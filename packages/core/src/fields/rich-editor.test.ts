/**
 * A document from a browser, measured against the buttons that could have made
 * it.
 *
 * The column keeps a tree rather than a string of HTML, so nothing here parses
 * anything: what is refused is refused by name. The toolbar is read twice —
 * once to draw the buttons, once to say what the document may hold — and these
 * tests are about the second reading.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import type { RichEditorTool } from "./rich-editor.js";
import { RichEditor } from "./rich-editor.js";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks === undefined ? {} : { marks }),
});

const tree = (made = RichEditor.make("body")) =>
  resolveSchema(Schema.make([made]), {}, { operation: "create" });

const answer = async (value: unknown, tools?: readonly RichEditorTool[]) => {
  const made =
    tools === undefined
      ? RichEditor.make("body")
      : RichEditor.make("body").toolbar(tools);
  return sanitize(await tree(made), { body: value }).rejected[0]?.reason;
};

describe("what a document may hold", () => {
  it("paragraphs, which need no button", async () => {
    expect(await answer(doc(para(text("Ada"))))).toBeUndefined();
  });

  it("an empty document, which is a reader who wrote nothing", async () => {
    expect(await answer(doc())).toBeUndefined();
    expect(await answer(null)).toBeUndefined();
  });

  it("what the toolbar offers", async () => {
    expect(await answer(doc(para(text("Ada", [{ type: "bold" }]))))).toBeUndefined();
    expect(
      await answer(
        doc({ type: "heading", attrs: { level: 2 }, content: [text("Ada")] }),
      ),
    ).toBeUndefined();
  });

  it("nothing the toolbar does not", async () => {
    // The list is read twice on purpose. A form that offers no strikethrough is
    // a form whose stored documents have none in them, however the state
    // arrives — the button is not the protection.
    expect(await answer(doc(para(text("Ada", [{ type: "strike" }]))))).toBe(
      "wrong-shape",
    );
    expect(await answer(doc({ type: "codeBlock", content: [text("ls")] }))).toBe(
      "wrong-shape",
    );
  });

  it("no heading at a level nobody declared", async () => {
    const only2 = ["h2"] as const;

    expect(
      await answer(doc({ type: "heading", attrs: { level: 2 }, content: [] }), only2),
    ).toBeUndefined();
    expect(
      await answer(doc({ type: "heading", attrs: { level: 3 }, content: [] }), only2),
    ).toBe("wrong-shape");
    expect(await answer(doc({ type: "heading", content: [] }), only2)).toBe(
      "wrong-shape",
    );
  });

  it("no node type this editor has never heard of", async () => {
    expect(await answer(doc({ type: "script", content: [text("alert(1)")] }))).toBe(
      "wrong-shape",
    );
    expect(await answer(doc({ type: "image", attrs: { src: "/a.png" } }))).toBe(
      "wrong-shape",
    );
  });

  it("no attribute a button does not set", async () => {
    expect(
      await answer(doc(para({ ...text("Ada"), attrs: { style: "color:red" } }))),
    ).toBe("wrong-shape");
  });

  it("nothing that is not a document at all", async () => {
    expect(await answer("<p>Ada</p>")).toBe("wrong-shape");
    expect(await answer({ type: "paragraph" })).toBe("wrong-shape");
    expect(await answer([para(text("Ada"))])).toBe("wrong-shape");
  });

  it("no text node that is not text, and no text node with children", async () => {
    expect(await answer(doc(para({ type: "text", text: 1 })))).toBe("wrong-shape");
    expect(await answer(doc(para({ type: "text", text: "Ada", content: [] })))).toBe(
      "wrong-shape",
    );
  });

  it("nothing nested deeper than a document goes", async () => {
    // A forged document nests as deep as its author cares to type, and a walk
    // that follows it runs out of stack.
    let deep: unknown = para(text("Ada"));
    for (let n = 0; n < 40; n += 1) deep = { type: "blockquote", content: [deep] };

    expect(await answer(doc(deep), ["blockquote"])).toBe("wrong-shape");
  });
});

describe("a link in a document", () => {
  const linked = (href: unknown) =>
    doc(para(text("Ada", [{ type: "link", attrs: { href } }])));

  it("goes where a browser may follow", async () => {
    expect(await answer(linked("https://example.com"))).toBeUndefined();
    expect(await answer(linked("mailto:ada@example.com"))).toBeUndefined();
    expect(await answer(linked("/people/1"))).toBeUndefined();
  });

  it("does not run anything", async () => {
    // The one attribute in a document that is an instruction to a browser
    // rather than a description of text.
    expect(await answer(linked("javascript:alert(1)"))).toBe("wrong-shape");
    expect(await answer(linked("data:text/html,<script>"))).toBe("wrong-shape");
    expect(await answer(linked("//example.com"))).toBe("wrong-shape");
  });

  it("goes somewhere at all", async () => {
    expect(await answer(linked(undefined))).toBe("wrong-shape");
    expect(await answer(linked(12))).toBe("wrong-shape");
  });
});

describe("a column somebody else filled", () => {
  const read = async (stored: unknown) =>
    serialise(
      await resolveSchema(
        Schema.make([RichEditor.make("body")]),
        { body: stored },
        { operation: "edit", record: { body: stored } },
      ),
    ).state["body"];

  it("is read as the document it holds", async () => {
    expect(await read(doc(para(text("Ada"))))).toEqual(doc(para(text("Ada"))));
  });

  it("is read the same way from a column that keeps it as text", async () => {
    // The same document, and the half above this should not have to ask which
    // kind of column it came out of.
    expect(await read(JSON.stringify(doc(para(text("Ada")))))).toEqual(
      doc(para(text("Ada"))),
    );
  });

  it("is left alone where it is not a document", async () => {
    expect(await read("<p>Ada</p>")).toBe("<p>Ada</p>");
    expect(await read('{"type":"paragraph"}')).toBe('{"type":"paragraph"}');
  });
});

describe("what it tells the browser", () => {
  it("which buttons to draw", async () => {
    const node = serialise(
      await tree(RichEditor.make("body").toolbar(["bold", "link"])),
    ).schema.children?.[0];

    expect(node?.type).toBe("RichEditor");
    expect(node?.props?.["toolbar"]).toEqual(["bold", "link"]);
  });

  it("a toolbar nobody asked to change", async () => {
    const node = serialise(await tree()).schema.children?.[0];

    expect(node?.props?.["toolbar"]).toContain("bold");
  });
});

describe("a button nothing draws", () => {
  it("stops the boot, and says what there is", () => {
    const complaints = auditSchema(
      Schema.make([RichEditor.make("body").toolbar(["bold", "h1" as RichEditorTool])]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("h1");
    expect(complaints[0]?.problem).toContain("blockquote");
  });
});
