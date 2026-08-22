/**
 * @vitest-environment jsdom
 *
 * The editor itself, once its chunk has landed.
 *
 * TipTap is real here rather than mocked: what these tests are about is the
 * agreement between the toolbar and the document, and a mock would agree with
 * whatever it was told.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichEditorSurface } from "./RichEditorSurface.js";

afterEach(cleanup);

const binding = {
  id: "body",
  "aria-describedby": "body-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (
  over: Partial<Parameters<typeof RichEditorSurface>[0]> = {},
): {
  onValueChange: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  submitted: ReturnType<typeof vi.fn>;
} => {
  const onValueChange = vi.fn();
  const submitted = vi.fn();
  const { container } = render(
    // Inside a form, because that is where the panel draws it — and a control
    // that submits the page instead of doing its own work only does so there.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted();
      }}
    >
      <RichEditorSurface
        value={null}
        onValueChange={onValueChange}
        toolbar={["bold", "italic", "h2", "bulletList", "link"]}
        status={{ lifecycle: "rest" }}
        binding={binding}
        label="Body"
        {...over}
      />
    </form>,
  );
  return { onValueChange, container, submitted };
};

describe("the page the reader writes on", () => {
  it("is a control the label and the help line point at", async () => {
    const { container } = draw();

    await waitFor(() => {
      const page = container.querySelector(".perch-rich__page");
      expect(page?.id).toBe("body");
      expect(page?.getAttribute("aria-describedby")).toBe("body-help");
      expect(page?.getAttribute("aria-label")).toBe("Body");
    });
  });

  it("shows the document it was given", async () => {
    draw({
      value: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Ada")).toBeTruthy();
    });
  });
});

describe("the toolbar", () => {
  it("draws a button for each tool the field declared, and no others", async () => {
    draw();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Bold" })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Heading" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Code block" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Strikethrough" })).toBeNull();
  });

  it("says whether what it makes is already on", async () => {
    draw();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed"),
      ).toBe("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });

  it("is drawn at all only where there is something in it", async () => {
    const { container } = draw({ toolbar: [] });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")).toBeTruthy();
    });
    expect(container.querySelector(".perch-rich__toolbar")).toBeNull();
  });
});

describe("what the editor is allowed to make", () => {
  it("nothing the toolbar does not offer, so the boundary never has to refuse", async () => {
    // The list is read twice: once to draw the buttons, once to say what the
    // document may hold. An editor that can make a node its own toolbar does
    // not offer is a form that saves what the server then turns away, silently.
    const { container } = draw({ toolbar: ["bold"] });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "Heading" })).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
  });
});

describe("making a link", () => {
  it("asks for the address on the page rather than in a browser dialog", async () => {
    // A dialog the browser draws is one a sandboxed frame may refuse to, and
    // one nothing on this page can style or test.
    const { container } = draw();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Link" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByLabelText("Address")).toBeTruthy();
    expect(container.querySelector(".perch-rich__link")).toBeTruthy();
  });

  it("makes one where the reader gives an address", async () => {
    const { container } = draw({
      value: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }],
      },
    });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("Ada");
    });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(container.querySelector("a")?.getAttribute("href")).toBe(
        "https://example.com",
      );
    });
    // Nothing was selected, so the address is the text: pressing Link with a
    // cursor rather than a selection means "put a link here".
    expect(container.querySelector("a")?.textContent).toBe("https://example.com");
  });

  it("does not save the page instead", async () => {
    // The address is asked for inside the panel's own form, and a form inside
    // a form is not a second form: what looks like Apply submits the page.
    const { container, submitted } = draw({
      value: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }],
      },
    });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("Ada");
    });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(submitted).not.toHaveBeenCalled();
  });

  it("makes nothing where the reader changes their mind", async () => {
    const { container, onValueChange } = draw({
      value: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }],
      },
    });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("Ada");
    });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(container.querySelector(".perch-rich__link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("a document this editor cannot draw", () => {
  const withHeading = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Ada" }],
      },
      { type: "paragraph", content: [{ type: "text", text: "Kept for years." }] },
    ],
  };

  it("is said so, rather than drawn as an empty page", async () => {
    // A toolbar that loses a button loses the node it made. Fed in, the whole
    // document is discarded and the page comes up blank — and the next
    // keystroke is a document the boundary accepts, which is the column gone.
    const { container } = draw({ value: withHeading, toolbar: ["bold"] });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich--unreadable")).toBeTruthy();
    });
    expect(screen.getByRole("status").textContent).toContain("no longer offers");
  });

  it("is not a page anybody can type on", async () => {
    const { container } = draw({ value: withHeading, toolbar: ["bold"] });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich--unreadable")).toBeTruthy();
    });
    expect(container.querySelector(".perch-rich__page")).toBeNull();
    expect(container.querySelector(".perch-rich__toolbar")).toBeNull();
  });

  it("says nothing to the form, so nothing is written over it", async () => {
    const { container, onValueChange } = draw({
      value: withHeading,
      toolbar: ["bold"],
    });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich--unreadable")).toBeTruthy();
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("what the server says after the editor exists", () => {
  const props = {
    onValueChange: vi.fn(),
    toolbar: ["bold"] as const,
    status: { lifecycle: "rest" } as const,
    binding,
    label: "Body",
  };
  const said = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  it("is what the editor shows", async () => {
    // The editor takes its content once and then keeps its own, which makes it
    // a second store nobody reconciles. The server owns the state.
    const { container, rerender } = render(
      <RichEditorSurface value={said("one")} {...props} />,
    );

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("one");
    });

    rerender(<RichEditorSurface value={said("two")} {...props} />);

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("two");
    });
  });

  it("is not announced back the moment the editor is built", async () => {
    // Setting content is an update like any other, so the editor said the
    // document it had just been given: a form dirty on arrival, and a round
    // trip asking the server about a value it already had.
    const onValueChange = vi.fn();
    const { container } = render(
      <RichEditorSurface
        value={said("one")}
        {...props}
        onValueChange={onValueChange}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("one");
    });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("is left alone where it is what the editor already holds", async () => {
    // The state comes back on every pass, and setting content moves the cursor.
    const onValueChange = vi.fn();
    const { container, rerender } = render(
      <RichEditorSurface
        value={said("one")}
        {...props}
        onValueChange={onValueChange}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")?.textContent).toBe("one");
    });

    // The same document, freshly built: what a round trip through JSON gives.
    rerender(
      <RichEditorSurface
        value={said("one")}
        {...props}
        onValueChange={onValueChange}
      />,
    );

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("a field nobody may write to", () => {
  it("puts the page and every button out of reach", async () => {
    const { container } = draw({
      status: { lifecycle: "rest", disabled: true },
      binding: { ...binding, disabled: true },
    });

    await waitFor(() => {
      expect(container.querySelector(".perch-rich__page")).toBeTruthy();
    });

    expect(
      container.querySelector(".perch-rich__page")?.getAttribute("contenteditable"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Bold" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
