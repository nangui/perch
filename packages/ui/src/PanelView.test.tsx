/**
 * @vitest-environment jsdom
 *
 * The View page, drawn.
 *
 * What it must not have is as much of the point as what it shows: nothing to
 * type into, nothing to submit, and no round trip to make.
 */
import { render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { beforeAll, describe, expect, it } from "vitest";
import { PanelView } from "./PanelView.js";
import { registerBuiltInComponents } from "./renderers.js";

beforeAll(() => {
  registerBuiltInComponents();
});

const payload = (
  children: NonNullable<SchemaPayload["schema"]["children"]>,
): SchemaPayload => ({
  schema: { id: "root", type: "Schema", children },
  state: {},
  errors: {},
});

describe("an entry on the page", () => {
  it("shows what the server read from the record", () => {
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Title", value: "Ada" },
        ])}
      />,
    );

    expect(screen.getByText("Ada")).toBeDefined();
  });

  it("shows a number as readily as a string", () => {
    render(
      <PanelView
        payload={payload([{ id: "a", type: "TextEntry", label: "Count", value: 12 }])}
      />,
    );

    expect(screen.getByText("12")).toBeDefined();
  });

  it("says what is missing rather than leaving a blank line", () => {
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "City", placeholder: "Not given" },
        ])}
      />,
    );

    expect(screen.getByText("Not given")).toBeDefined();
  });

  it("marks itself empty, so the blank reads as one and not as an oversight", () => {
    const { container } = render(
      <PanelView payload={payload([{ id: "a", type: "TextEntry", label: "City" }])} />,
    );

    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
  });
});

describe("what the page does not offer", () => {
  const page = (): HTMLElement =>
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Title", value: "Ada" },
          { id: "b", type: "TextEntry", label: "Author", value: "Grace" },
        ])}
      />,
    ).container;

  it("has nothing to type into", () => {
    expect(page().querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("has nothing to submit", () => {
    expect(page().querySelectorAll("button, form").length).toBe(0);
  });
});
