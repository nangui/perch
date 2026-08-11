/**
 * @vitest-environment jsdom
 *
 * Which control a Select node gets.
 *
 * The declaration alone does not decide it: a host that cannot ask the server
 * renders the plain control, because a search box that answers nothing is
 * worse than no search box.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import { SchemaRenderer } from "./SchemaRenderer.js";

beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element["hasPointerCapture"] = () => false;
  element["setPointerCapture"] = () => undefined;
  element["releasePointerCapture"] = () => undefined;
  element["scrollIntoView"] = () => undefined;
});

afterEach(cleanup);

function payload(searchable: boolean): SchemaPayload {
  return {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "authorId",
          type: "Select",
          path: "authorId",
          label: "Author",
          options: [{ value: 2, label: "Ada" }],
          props: { searchable, multiple: false, preload: false, optionsLimit: 50 },
        },
      ],
    },
    state: {},
    errors: {},
  };
}

function draw(searchable: boolean, canAsk: boolean): void {
  resetRegistry();
  registerBuiltInComponents();
  render(
    <SchemaRenderer
      payload={payload(searchable)}
      onChange={vi.fn()}
      {...(canAsk ? { searchOptions: vi.fn(() => Promise.resolve([])) } : {})}
    />,
  );
}

describe("a Select the server declared searchable", () => {
  it("gets a control with a search box in it", () => {
    draw(true, true);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("combobox", { name: "Search Author" })).toBeTruthy();
  });
});

describe("a Select that declared nothing of the sort", () => {
  it("gets the plain control, with no box to type in", () => {
    draw(false, true);

    expect(screen.queryByRole("combobox", { name: "Search Author" })).toBeNull();
  });
});

describe("a searchable Select the host cannot ask about", () => {
  it("gets the plain control rather than a box that answers nothing", () => {
    draw(true, false);

    expect(screen.queryByRole("combobox", { name: "Search Author" })).toBeNull();
  });
});
