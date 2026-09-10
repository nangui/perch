/**
 * @vitest-environment jsdom
 *
 * A section that folds.
 *
 * `.collapsible()` has been on `Section` since layouts existed and crossed the
 * wire unread the whole time — one of the four the prop guard was built to
 * find. This is the reader it never had.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import { SchemaRenderer } from "./SchemaRenderer.js";

afterEach(cleanup);

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});

function draw(props?: Record<string, unknown>): void {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "about",
          type: "Section",
          label: "About",
          ...(props === undefined ? {} : { props }),
          children: [{ id: "bio", type: "TextInput", path: "bio", label: "Bio" }],
        },
      ],
    },
    state: { bio: "Something" },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={vi.fn()} />);
}

/**
 * The section's own body, by the id the renderer gives it.
 *
 * The schema around it is a layout too, and the first `.perch-layout__body` on
 * the page belongs to that one.
 */
const body = (): Element | null => document.querySelector("#about-body");

describe("a section nobody made collapsible", () => {
  it("has no control to fold it", () => {
    draw();

    expect(screen.queryByRole("button", { name: "About" })).toBeNull();
  });

  it("shows its fields, with nothing hidden", () => {
    draw();

    expect(body()?.hasAttribute("hidden")).toBe(false);
  });
});

describe("a section that folds", () => {
  it("makes the whole heading the control", () => {
    // A title beside a small arrow is a target most people aim at and miss.
    draw({ collapsible: true });

    expect(screen.getByRole("button", { name: /About/ })).toBeTruthy();
  });

  it("hides the fields without throwing them away", () => {
    draw({ collapsible: true });
    fireEvent.click(screen.getByRole("button", { name: /About/ }));

    expect(body()?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByLabelText("Bio")).toHaveProperty("value", "Something");
  });

  it("says which way it is, for anybody who cannot see the arrow", () => {
    draw({ collapsible: true });
    const heading = screen.getByRole("button", { name: /About/ });

    expect(heading.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(heading);
    expect(heading.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens again", () => {
    draw({ collapsible: true });
    const heading = screen.getByRole("button", { name: /About/ });

    fireEvent.click(heading);
    fireEvent.click(heading);

    expect(body()?.hasAttribute("hidden")).toBe(false);
  });
});

describe("a section that starts folded", () => {
  it("is folded on arrival", () => {
    draw({ collapsible: true, collapsed: true });

    expect(body()?.hasAttribute("hidden")).toBe(true);
  });

  it("is where it starts and not where it stays", () => {
    // After the first press it is the reader's, and the declaration has had
    // its say.
    draw({ collapsible: true, collapsed: true });
    fireEvent.click(screen.getByRole("button", { name: /About/ }));

    expect(body()?.hasAttribute("hidden")).toBe(false);
  });
});

describe("a section that was given an icon", () => {
  it("draws the shape the name stands for, beside the title", () => {
    // A name and not a character, so what lands in the heading is the panel's
    // own drawing rather than whatever the reader's font had for an emoji.
    draw({ icon: "tag" });
    const mark = document.querySelector(".perch-layout__icon");

    expect(mark?.tagName.toLowerCase()).toBe("svg");
    expect(mark?.textContent).toBe("");
  });

  it("draws it on one that folds too, where the heading is a button", () => {
    draw({ icon: "tag", collapsible: true });

    const button = screen.getByRole("button", { name: /About/ });
    expect(button.querySelector(".perch-layout__icon")).not.toBeNull();
  });

  it("keeps it out of the name a screen reader reads", () => {
    // Decoration beside the words, never instead of them.
    draw({ icon: "tag", collapsible: true });

    expect(screen.getByRole("button", { name: "About" })).toBeDefined();
  });

  it("draws none where none was given", () => {
    draw();

    expect(document.querySelector(".perch-layout__icon")).toBeNull();
  });
});
