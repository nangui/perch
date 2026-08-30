/**
 * @vitest-environment jsdom
 *
 * Which panel is open, kept in the address.
 *
 * So a reader who reloads, comes back through their history, or sends somebody
 * the page lands where they were. A form with six panels is otherwise one they
 * re-navigate on every visit, and a link to it always points at the first.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "./SchemaRenderer.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
  cleanup();
  globalThis.history.replaceState(null, "", "/people/1/edit");
});

const payload = (persist: boolean): SchemaPayload => ({
  schema: {
    id: "0",
    type: "Schema",
    children: [
      {
        id: "set",
        type: "Tabs",
        ...(persist ? { props: { persistTab: true } } : {}),
        children: [
          { id: "one", type: "Tab", label: "Identity", children: [] },
          { id: "two", type: "Tab", label: "Address", children: [] },
        ],
      },
    ],
  },
  state: {},
  errors: {},
});

const draw = (persist: boolean): void => {
  render(<SchemaRenderer payload={payload(persist)} onChange={vi.fn()} />);
};

describe("a tab set that asked to be remembered", () => {
  it("writes the panel it was moved to into the address", () => {
    draw(true);
    fireEvent.click(screen.getByRole("tab", { name: "Address" }));

    expect(new URL(globalThis.location.href).searchParams.get("tab.set")).toBe("two");
  });

  it("opens the one the address names", () => {
    globalThis.history.replaceState(null, "", "/people/1/edit?tab.set=two");
    draw(true);

    expect(
      screen.getByRole("tab", { name: "Address" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("names the panel rather than its position", () => {
    // An index points at whatever is third today, and a link sent last week
    // opens the wrong panel the day somebody reorders them.
    draw(true);
    fireEvent.click(screen.getByRole("tab", { name: "Address" }));

    expect(globalThis.location.search).toContain("two");
    expect(globalThis.location.search).not.toContain("=1");
  });

  it("adds nothing to the history, because moving tabs is not navigating", () => {
    // A reader who looked at four panels and pressed Back expects the page they
    // came from, not the third panel of the one they are on.
    const before = globalThis.history.length;
    draw(true);
    fireEvent.click(screen.getByRole("tab", { name: "Address" }));

    expect(globalThis.history.length).toBe(before);
  });

  it("falls back to the first where the address names one that is gone", () => {
    globalThis.history.replaceState(null, "", "/people/1/edit?tab.set=removed");
    draw(true);

    expect(
      screen.getByRole("tab", { name: "Identity" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});

describe("a tab set that did not ask", () => {
  it("leaves the address alone", () => {
    draw(false);
    fireEvent.click(screen.getByRole("tab", { name: "Address" }));

    expect(globalThis.location.search).toBe("");
  });

  it("still moves between panels", () => {
    draw(false);
    fireEvent.click(screen.getByRole("tab", { name: "Address" }));

    expect(
      screen.getByRole("tab", { name: "Address" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
