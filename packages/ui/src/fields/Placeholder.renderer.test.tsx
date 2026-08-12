/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { SchemaNode } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

function draw(children: readonly SchemaNode[]): void {
  resetRegistry();
  registerBuiltInComponents();
  render(
    <SchemaRenderer
      payload={{ schema: { id: "0", type: "Schema", children }, state: {}, errors: {} }}
      onChange={vi.fn()}
    />,
  );
}

const PLACEHOLDER = {
  id: "withTax",
  type: "Placeholder",
  path: "withTax",
  label: "With tax",
  content: "120 inc. tax",
};

describe("a Placeholder", () => {
  it("shows what the server computed", () => {
    draw([PLACEHOLDER]);

    expect(screen.getByText("120 inc. tax")).toBeTruthy();
  });

  it("is named, so the reading is not an orphan line", () => {
    draw([PLACEHOLDER]);

    expect(screen.getByText("With tax")).toBeTruthy();
  });

  it("is nothing to focus, because there is nothing to do to it", () => {
    draw([PLACEHOLDER]);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector("[tabindex]")).toBeNull();
  });

  it("shows an empty reading rather than the word undefined", () => {
    draw([{ id: "note", type: "Placeholder", path: "note", label: "Note" }]);

    expect(document.querySelector(".perch-placeholder")?.textContent).toBe("");
  });
});

describe("a Hidden field", () => {
  it("draws nothing at all", () => {
    draw([{ id: "authorId", type: "Hidden", path: "authorId", label: "Author" }]);

    expect(screen.queryByText("Author")).toBeNull();
    expect(document.querySelector(".perch-field")).toBeNull();
  });

  it("draws nothing rather than the marker for a type nobody wrote", () => {
    // An unregistered type shows a loud gap in development. A hidden field is
    // not a gap.
    draw([{ id: "authorId", type: "Hidden", path: "authorId" }]);

    expect(document.querySelector("[data-perch-unknown]")).toBeNull();
  });

  it("leaves the fields around it alone", () => {
    draw([
      { id: "authorId", type: "Hidden", path: "authorId" },
      { id: "title", type: "TextInput", path: "title", label: "Title" },
    ]);

    expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
  });
});
