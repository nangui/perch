/**
 * Markdown, on the server's side of the wire.
 *
 * There is very little for the server to say about it, and that is the point:
 * the column holds text, so what arrives is text or it is refused. What is
 * worth testing is the small surface that is not text — the length the field
 * declares, the buttons it says the page should draw, and the boot refusing a
 * button no page has.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import type { MarkdownTool } from "./markdown-editor.js";
import { MarkdownEditor } from "./markdown-editor.js";

const tree = (made = MarkdownEditor.make("body")) =>
  resolveSchema(Schema.make([made]), {}, { operation: "create" });

const answer = async (value: unknown, made?: MarkdownEditor) =>
  sanitize(await tree(made), { body: value }).rejected[0]?.reason;

/** What the field says about a value it did admit. */
const errorFor = async (made: MarkdownEditor, value: unknown) =>
  (await resolveSchema(Schema.make([made]), { body: value }, { operation: "create" }))
    .errors["body"];

describe("what arrives", () => {
  it("is text, whatever it says", async () => {
    expect(await answer("# Ada")).toBeUndefined();
    // Syntax nobody closed is a reader mid-thought, not a bad request.
    expect(await answer("**half a")).toBeUndefined();
    expect(await answer("")).toBeUndefined();
  });

  it("is nothing, where the reader wrote nothing", async () => {
    expect(await answer(null)).toBeUndefined();
    expect(await answer(undefined)).toBeUndefined();
  });

  it("is not anything that is not text", async () => {
    expect(await answer(12)).toBe("wrong-shape");
    expect(await answer(true)).toBe("wrong-shape");
    expect(await answer({ type: "doc" })).toBe("wrong-shape");
    expect(await answer(["# Ada"])).toBe("wrong-shape");
  });

  it("is as long as the field said it could be", async () => {
    const short = MarkdownEditor.make("body").maxLength(4);

    expect(await errorFor(short, "Ada")).toBeUndefined();
    expect(await errorFor(short, "Ada Lovelace")).toBe("Must be at most 4 characters.");
  });

  it("is at least as long, where a length was asked for", async () => {
    const long = MarkdownEditor.make("body").minLength(4);

    expect(await errorFor(long, "Ada")).toBe("Must be at least 4 characters.");
    expect(await errorFor(long, "Ada Lovelace")).toBeUndefined();
  });
});

describe("what a column already holds", () => {
  it("is read back as the text it is", async () => {
    const state = serialise(
      await resolveSchema(
        Schema.make([MarkdownEditor.make("body")]),
        { body: "## Notes\n\n- one" },
        { operation: "edit", record: { body: "## Notes\n\n- one" } },
      ),
    ).state["body"];

    expect(state).toBe("## Notes\n\n- one");
  });
});

describe("what it tells the browser", () => {
  it("which buttons to draw", async () => {
    const node = serialise(
      await tree(MarkdownEditor.make("body").toolbar(["bold", "link"])),
    ).schema.children?.[0];

    expect(node?.type).toBe("MarkdownEditor");
    expect(node?.props?.["toolbar"]).toEqual(["bold", "link"]);
  });

  it("a toolbar nobody asked to change", async () => {
    expect(serialise(await tree()).schema.children?.[0]?.props?.["toolbar"]).toContain(
      "bold",
    );
  });

  it("how tall the box starts, and how much it takes", async () => {
    const node = serialise(
      await tree(MarkdownEditor.make("body").rows(20).maxLength(500)),
    ).schema.children?.[0];

    expect(node?.props?.["rows"]).toBe(20);
    expect(node?.props?.["maxLength"]).toBe(500);
  });

  it("that typing waits, where the field asks for a round trip", async () => {
    const node = serialise(await tree(MarkdownEditor.make("body").live())).schema
      .children?.[0];

    expect(node?.live?.debounce).toBe(400);
  });
});

describe("a narrowed toolbar", () => {
  it("takes nothing away from what may be stored", async () => {
    // Unlike the rich editor's, this list does not close the document: the
    // column holds text either way, and refusing a heading because the button
    // was taken off the bar would destroy text a reader typed by hand.
    const plain = MarkdownEditor.make("body").toolbar(["bold"]);

    expect(await answer("## Notes\n\n> quoted", plain)).toBeUndefined();
  });
});

describe("a button nothing draws", () => {
  it("stops the boot, and says what there is", () => {
    const complaints = auditSchema(
      Schema.make([
        MarkdownEditor.make("body").toolbar(["bold", "table" as MarkdownTool]),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("table");
    expect(complaints[0]?.problem).toContain("blockquote");
  });
});
