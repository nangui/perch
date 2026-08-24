/**
 * @vitest-environment jsdom
 *
 * The box, the buttons, and the two panels.
 *
 * The buttons write syntax rather than styling anything, so what is tested is
 * the text that comes out and where the cursor lands — a button that writes at
 * the end of the document while the reader is halfway up it is worse than no
 * button. The preview is tested for what it draws: elements, from a tree.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor.js";

afterEach(cleanup);

const binding = {
  id: "body",
  "aria-describedby": "body-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (over: Partial<Parameters<typeof MarkdownEditor>[0]> = {}) => {
  const wrote = vi.fn();
  const { container } = render(
    <MarkdownEditor
      value=""
      onValueChange={wrote}
      toolbar={["bold", "italic", "h2", "bulletList", "link", "codeBlock"]}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Body"
      {...over}
    />,
  );
  const box = container.querySelector("textarea");
  return { container, wrote, box };
};

/** Presses a button with the cursor or selection the reader would have. */
const press = (
  label: string,
  { value = "", from = 0, to }: { value?: string; from?: number; to?: number } = {},
): ReturnType<typeof vi.fn> => {
  const { wrote, box } = draw({ value });
  if (box === null) throw new Error("no box");
  box.value = value;
  box.setSelectionRange(from, to ?? from);
  fireEvent.click(screen.getByLabelText(label));
  return wrote;
};

describe("a button", () => {
  it("wraps what the reader chose", () => {
    expect(
      press("Bold", { value: "Ada Lovelace", from: 0, to: 3 }),
    ).toHaveBeenCalledWith("**Ada** Lovelace");
  });

  it("opens the syntax where they chose nothing", () => {
    // Both halves are written and the cursor goes between them, so the next
    // thing typed is inside the emphasis rather than after it.
    expect(press("Italic", { value: "Ada", from: 3 })).toHaveBeenCalledWith("Ada**");
  });

  it("marks the line, not the selection, where the syntax belongs to a line", () => {
    // A heading is a property of the whole line: written at the head of the one
    // the cursor is on, however much of it is selected.
    expect(
      press("Heading", { value: "Notes\nAda", from: 8, to: 8 }),
    ).toHaveBeenCalledWith("Notes\n## Ada");
  });

  it("marks the first line too, where there is no line above it", () => {
    expect(press("Bulleted list", { value: "one", from: 1 })).toHaveBeenCalledWith(
      "- one",
    );
  });

  it("writes a link with somewhere to type the address", () => {
    expect(press("Link", { value: "", from: 0 })).toHaveBeenCalledWith(
      "[text](https://)",
    );
  });

  it("keeps the chosen words as the link's text", () => {
    expect(press("Link", { value: "Ada", from: 0, to: 3 })).toHaveBeenCalledWith(
      "[Ada](https://)",
    );
  });

  it("does nothing to a field the reader may not change", () => {
    const { wrote } = draw({ status: { lifecycle: "rest", disabled: true } });

    fireEvent.click(screen.getByLabelText("Bold"));
    expect(wrote).not.toHaveBeenCalled();
  });
});

describe("what the bar offers", () => {
  it("is what the field asked for, and nothing else", () => {
    draw({ toolbar: ["bold", "link"] });

    expect(screen.getByLabelText("Bold")).toBeTruthy();
    expect(screen.queryByLabelText("Quote")).toBeNull();
  });

  it("is nothing at all, where the field asked for nothing", () => {
    const { container } = draw({ toolbar: [] });

    expect(container.querySelector(".perch-markdown__tool")).toBeNull();
    // The panels stay: a reader can still see what they wrote.
    expect(screen.getByText("Preview")).toBeTruthy();
  });
});

describe("the two panels", () => {
  const preview = (value: string) => {
    const { container } = draw({ value });
    fireEvent.click(screen.getByText("Preview"));
    return container.querySelector(".perch-markdown__preview");
  };

  it("start on the one that is written in", () => {
    const { container } = draw();

    expect(container.querySelector("textarea")?.closest("[hidden]")).toBeNull();
    expect(
      container.querySelector(".perch-markdown__preview")?.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("name each other, so a tab controls something", () => {
    // A `tablist` whose tabs point at nothing is a declaration nothing acts on:
    // assistive technology reads two buttons and finds no panels.
    const { container } = draw();
    const tabs = [...container.querySelectorAll('[role="tab"]')];

    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      const panel = container.querySelector(
        `#${CSS.escape(tab.getAttribute("aria-controls") ?? "")}`,
      );
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }
  });

  it("keep the box, so the label above it never points at nothing", () => {
    // Taking it away while the preview is up left the field with no accessible
    // name and its help text attached to an element that had gone.
    const { container } = draw({ value: "Ada" });
    fireEvent.click(screen.getByText("Preview"));

    expect(container.querySelector(`#${CSS.escape(binding.id)}`)).toBeTruthy();
  });

  it("keep what the reader wrote, and where they were in it", () => {
    const { container } = draw({ value: "Ada Lovelace" });
    const box = container.querySelector("textarea");
    box?.setSelectionRange(4, 4);
    fireEvent.click(screen.getByText("Preview"));
    fireEvent.click(screen.getByText("Write"));

    expect(container.querySelector("textarea")).toBe(box);
    expect(box?.selectionStart).toBe(4);
  });

  it("draw the document as elements", () => {
    const shown = preview("## Notes\n\n- one\n- two");

    expect(shown?.querySelector("h2")?.textContent).toBe("Notes");
    expect(shown?.querySelectorAll("li")).toHaveLength(2);
  });

  it("draw emphasis as emphasis", () => {
    const shown = preview("**Ada** and `code`");

    expect(shown?.querySelector("strong")?.textContent).toBe("Ada");
    expect(shown?.querySelector("code")?.textContent).toBe("code");
  });

  it("say so where nothing has been written", () => {
    expect(preview("   ")?.textContent).toBe("Nothing written yet.");
  });

  it("build the preview only while it is up", () => {
    // Parsing the document on every keystroke of a panel nobody is looking at
    // is work for nothing, and on a long document it is felt.
    const { container } = draw({ value: "## Notes" });

    expect(container.querySelector(".perch-markdown__preview h2")).toBeNull();
    fireEvent.click(screen.getByText("Preview"));
    expect(container.querySelector(".perch-markdown__preview h2")).toBeTruthy();
  });

  it("take the buttons away, there being no cursor to write at", () => {
    draw({ value: "Ada" });
    fireEvent.click(screen.getByText("Preview"));

    expect(screen.getByLabelText("Bold").hasAttribute("disabled")).toBe(true);
  });
});

describe("a declared limit", () => {
  it("is counted where the reader can see it", () => {
    const { container } = draw({ value: "Ada", maxLength: 10 });

    expect(container.querySelector(".perch-markdown__count")?.textContent).toBe(
      "3 / 10",
    );
  });

  it("counts what the person typing counts", () => {
    // A family emoji is seven code points and one character, and the footer
    // must agree with the error the server would write under it.
    const { container } = draw({ value: "👨‍👩‍👧", maxLength: 10 });

    expect(container.querySelector(".perch-markdown__count")?.textContent).toBe(
      "1 / 10",
    );
  });

  it("does not clip the box, nor stop a button", () => {
    // Over the limit is an error state a reader must be able to see. Clipping
    // hides what they wrote, and a button that quietly declined to write would
    // be a button doing nothing.
    const { container, box } = draw({ value: "Ada Lovelace", maxLength: 4 });

    expect(box?.hasAttribute("maxlength")).toBe(false);
    expect(container.querySelector(".perch-markdown__count--error")).toBeTruthy();
  });

  it("lets a button write past it", () => {
    const { wrote, box } = draw({ value: "Ada", maxLength: 3 });
    box?.setSelectionRange(0, 3);
    fireEvent.click(screen.getByLabelText("Bold"));

    expect(wrote).toHaveBeenCalledWith("**Ada**");
  });

  it("says nothing where no limit was declared", () => {
    const { container } = draw({ value: "Ada" });

    expect(container.querySelector(".perch-markdown__footer")).toBeNull();
  });
});

describe("a link in the preview", () => {
  const drawn = (value: string) => {
    const { container } = draw({ value });
    fireEvent.click(screen.getByText("Preview"));
    return container.querySelector(".perch-markdown__preview");
  };

  it("goes where it says, and takes nothing of this page with it", () => {
    const anchor = drawn("[here](https://example.com)")?.querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("is text where a browser may not follow it", () => {
    // Nothing in the preview is ever built from a string of markup, so the
    // worst a document can do is say something that looks like a link. It is
    // drawn as the words it is made of.
    const shown = drawn("[here](javascript:alert(1))");

    expect(shown?.querySelector("a")).toBeNull();
    expect(shown?.textContent).toContain("javascript:alert(1)");
  });
});
