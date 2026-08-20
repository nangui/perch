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
