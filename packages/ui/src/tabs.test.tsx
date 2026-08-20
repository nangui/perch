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
