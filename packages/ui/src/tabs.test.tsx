/**
 * @vitest-environment jsdom
 *
 * Panels, one at a time.
 *
 * The layouts are one implementation shared by a form and an infolist, so a
 * panel here holds a field and the next one an entry, drawn by the same
 * `Tabs`.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import { SchemaRenderer } from "./SchemaRenderer.js";

afterEach(cleanup);

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});

const PANELS: readonly SchemaNode[] = [
  {
    id: "one",
    type: "Tab",
    label: "About",
    children: [{ id: "bio", type: "TextInput", path: "bio", label: "Bio" }],
  },
  {
    id: "two",
    type: "Tab",
    label: "Status",
    children: [{ id: "note", type: "TextEntry", label: "Note", value: "Kept" }],
  },
];

const payload: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [{ id: "t", type: "Tabs", children: PANELS }],
  },
  state: { bio: "Something" },
  errors: {},
};

const draw = (): void => {
  render(<SchemaRenderer payload={payload} onChange={() => undefined} />);
};

describe("what a set of tabs offers", () => {
  it("names each panel, and says which one is being read", () => {
    draw();

    expect(
      screen.getByRole("tab", { name: "About" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("shows one panel and folds the rest", () => {
    draw();

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels.map((panel) => panel.hasAttribute("hidden"))).toEqual([false, true]);
  });

  it("keeps a folded panel's contents in the page", () => {
    // Hidden rather than unmounted, like a folded section: a field in a tab
    // nobody is looking at is still filled in and still saved.
    draw();

    expect(document.querySelector("#two .perch-entry")?.textContent).toBe("Kept");
  });

  it("changes panel on a press", () => {
    draw();
    fireEvent.click(screen.getByRole("tab", { name: "Status" }));

    expect(
      screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.querySelector("#two")?.hasAttribute("hidden")).toBe(false);
  });
});

describe("reaching the panels from a keyboard", () => {
  it("puts one tab in the tab order, not all of them", () => {
    // Otherwise the keyboard walks through every panel's worth of controls to
    // get past a set of tabs.
    draw();

    expect(screen.getByRole("tab", { name: "About" }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Status" }).tabIndex).toBe(-1);
  });

  it("moves with the arrows, and takes focus along", () => {
    draw();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    const status = screen.getByRole("tab", { name: "Status" });
    expect(status.getAttribute("aria-selected")).toBe("true");
    // Selected and not focused leaves a reader pressing arrows and hearing
    // nothing.
    expect(document.activeElement).toBe(status);
  });

  it("wraps rather than stopping at the end", () => {
    draw();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    expect(
      screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("ignores a key that means nothing here", () => {
    draw();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "a" });

    expect(
      screen.getByRole("tab", { name: "About" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});

describe("a tab's own line of prose", () => {
  it("is drawn inside the panel it belongs to", () => {
    // This renderer maps a panel's children itself rather than handing the
    // panel to the layout renderer, so a description on a tab crossed the wire
    // and reached nothing.
    render(
      <SchemaRenderer
        payload={{
          schema: {
            id: "root",
            type: "Schema",
            children: [
              {
                id: "tabs",
                type: "Tabs",
                children: [
                  {
                    id: "one",
                    type: "Tab",
                    label: "About",
                    description: "Who they are.",
                    children: [{ id: "a", type: "TextInput", path: "a", label: "A" }],
                  },
                ],
              },
            ],
          },
          state: {},
          errors: {},
        }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("Who they are.")).toBeTruthy();
  });
});

describe("a callout on a page", () => {
  const box = (props: Record<string, unknown>, description?: string) =>
    render(
      <SchemaRenderer
        payload={{
          schema: {
            id: "root",
            type: "Schema",
            children: [
              {
                id: "note",
                type: "Callout",
                label: "Careful",
                props,
                ...(description === undefined ? {} : { description }),
                children: [
                  { id: "confirm", type: "TextInput", path: "confirm", label: "Sure" },
                ],
              },
            ],
          },
          state: {},
          errors: {},
        }}
        onChange={() => undefined}
      />,
    ).container;

  it("says what it has to say, and holds what it is about", () => {
    const container = box({}, "This cannot be undone.");

    expect(screen.getByText("Careful")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    expect(container.querySelector(".perch-layout--callout")).not.toBeNull();
    // The field inside is a field: a warning above the two inputs it is about
    // reads as one thing, and one floating beside them reads as decoration.
    expect(screen.getByLabelText("Sure")).toBeTruthy();
  });

  it("carries its tone as data, not as a colour the stylesheet has to guess", () => {
    expect(
      box({ tone: "danger" })
        .querySelector(".perch-layout--callout")
        ?.getAttribute("data-tone"),
    ).toBe("danger");
  });

  it("falls back rather than becoming a class the stylesheet has not got", () => {
    // A box with no background reads as a rendering fault, not as a tone.
    expect(
      box({ tone: "chartreuse" })
        .querySelector(".perch-layout--callout")
        ?.getAttribute("data-tone"),
    ).toBeNull();
  });
});

describe("static content on a page", () => {
  const drawn = (node: SchemaNode) =>
    render(
      <SchemaRenderer
        payload={{
          schema: { id: "root", type: "Schema", children: [node] },
          state: {},
          errors: {},
        }}
        onChange={() => undefined}
      />,
    ).container;

  it("draws a paragraph with no field chrome around it", () => {
    // A shell puts a label above and help below, which is right for a control
    // and wrong for a sentence between two sections.
    const container = drawn({
      id: "note",
      type: "Text",
      content: "Rates apply from Monday.",
      props: { tone: "warning" },
    });

    expect(screen.getByText("Rates apply from Monday.")).toBeTruthy();
    expect(container.querySelector(".perch-field__label")).toBeNull();
    expect(
      container.querySelector(".perch-prime--text")?.getAttribute("data-tone"),
    ).toBe("warning");
  });

  it("draws a picture by its address, and says what it is", () => {
    const container = drawn({
      id: "chart",
      type: "Image",
      content: "/c.png",
      props: { alt: "A rate chart" },
    });
    const picture = container.querySelector("img");

    expect(picture?.getAttribute("src")).toBe("/c.png");
    expect(picture?.getAttribute("alt")).toBe("A rate chart");
  });

  it("treats a picture nobody described as decoration, not as an unnamed one", () => {
    const container = drawn({ id: "chart", type: "Image", content: "/c.png" });

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("hides a mark from a reader who would only hear the character", () => {
    const container = drawn({ id: "flag", type: "Icon", content: "\u2691" });

    expect(
      container.querySelector(".perch-prime--icon")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("draws nothing at all where there is nothing to draw", () => {
    // An empty paragraph would take a line of the page and say nothing on it.
    expect(
      drawn({ id: "note", type: "Text" }).querySelector(".perch-prime"),
    ).toBeNull();
  });

  it("draws nothing where what came back was blank, not only absent", () => {
    // A browser resolves `src=""` against the document and fetches the page
    // again — so a source the server would not vouch for is no image at all.
    expect(
      drawn({ id: "chart", type: "Image", content: "" }).querySelector("img"),
    ).toBeNull();
    expect(
      drawn({ id: "note", type: "Text", content: "" }).querySelector(".perch-prime"),
    ).toBeNull();
    expect(
      drawn({ id: "flag", type: "Icon", content: "" }).querySelector(".perch-prime"),
    ).toBeNull();
  });
});

describe("a group of fields on a page", () => {
  const drawn = (node: SchemaNode) =>
    render(
      <SchemaRenderer
        payload={{
          schema: { id: "root", type: "Schema", children: [node] },
          state: {},
          errors: {},
        }}
        onChange={() => undefined}
      />,
    ).container;

  const group = (over: Partial<SchemaNode> = {}): SchemaNode => ({
    id: "when",
    type: "Fieldset",
    label: "When they are here",
    children: [{ id: "from", type: "TextInput", path: "from", label: "From" }],
    ...over,
  });

  it("is a group the browser announces, not a heading with fields under it", () => {
    // The grouping is the whole point of the component, so it is the part that
    // has to be real: a `div` with a heading is a heading and some fields.
    drawn(group());

    expect(screen.getByRole("group", { name: "When they are here" })).toBeTruthy();
  });

  it("holds what it was given", () => {
    drawn(group());

    expect(screen.getByLabelText("From")).toBeTruthy();
  });

  it("says its own line of prose, under its name", () => {
    drawn(group({ description: "Both inclusive." }));

    expect(screen.getByText("Both inclusive.")).toBeTruthy();
  });

  it("hides the mark beside its name from a reader who has the name", () => {
    const container = drawn(group({ props: { icon: "*" } }));

    expect(
      container.querySelector(".perch-layout__icon")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("takes its controls out of reach when the group is disabled", () => {
    // The server refuses what a disabled group holds, and the element says so
    // where a browser will act on it. Only the attribute is asserted: jsdom
    // does not propagate a fieldset's `disabled` to the controls inside, so
    // asking whether the input is disabled here would test the environment.
    // What the reader is actually shown does not rest on that anyway — every
    // field inside arrives disabled in its own right, which core settles.
    const container = drawn(group({ disabled: true }));

    expect(container.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
  });

  it("draws a group with no name rather than an empty legend", () => {
    const container = drawn({
      id: "when",
      type: "Fieldset",
      children: [{ id: "from", type: "TextInput", path: "from", label: "From" }],
    });

    expect(container.querySelector("legend")).toBeNull();
    expect(container.querySelector("fieldset")).not.toBeNull();
  });
});

describe("a layout named or described with nothing", () => {
  const drawn = (node: SchemaNode) =>
    render(
      <SchemaRenderer
        payload={{
          schema: { id: "root", type: "Schema", children: [node] },
          state: {},
          errors: {},
        }}
        onChange={() => undefined}
      />,
    ).container;

  it("draws no legend for a group with a blank name", () => {
    // An empty legend names a group with nothing, which is what a group with
    // no legend already is — only with an extra element in the tree.
    const container = drawn({
      id: "g",
      type: "Fieldset",
      label: "",
      children: [],
    });

    expect(container.querySelector("legend")).toBeNull();
    expect(container.querySelector("fieldset")).not.toBeNull();
  });

  it("draws no heading for a section with a blank name", () => {
    const container = drawn({ id: "s", type: "Section", label: "", children: [] });

    expect(container.querySelector(".perch-layout__title")).toBeNull();
  });

  it("draws no line of prose for a blank description", () => {
    const container = drawn({
      id: "s",
      type: "Section",
      label: "Named",
      description: "",
      children: [],
    });

    expect(container.querySelector(".perch-layout__description")).toBeNull();
  });

  it("draws one for a tab, from the same place as the rest", () => {
    // Three renderers drew this and one of them was missed once. They share it
    // now, so the next one to draw a layout cannot forget.
    const container = drawn({
      id: "tabs",
      type: "Tabs",
      children: [
        {
          id: "one",
          type: "Tab",
          label: "About",
          description: "Who they are.",
          children: [],
        },
      ],
    });

    expect(container.querySelectorAll(".perch-layout__description")).toHaveLength(1);
  });
});
