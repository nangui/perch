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

/** The entry itself, not the shell around it: the label is text too. */
const entry = (props: Record<string, unknown>, value?: unknown): string => {
  const { container } = render(
    <PanelView
      payload={payload([
        {
          id: "a",
          type: "TextEntry",
          label: "Value",
          ...(value === undefined ? {} : { value }),
          props,
        },
      ])}
    />,
  );
  return container.querySelector(".perch-entry")?.textContent ?? "";
};

describe("a value the server said how to present", () => {
  it("reads a timestamp in the zone that was named, not the machine's", () => {
    // 08:00 UTC is 10:00 in Paris. A page that showed 08:00 would be right
    // about the instant and wrong about the question anybody is asking.
    const shown = entry(
      { format: "dateTime", timezone: "Europe/Paris" },
      "2026-06-15T08:00:00.000Z",
    );

    expect(shown).toContain("10:00");
  });

  it("groups a number the way the reader's own locale groups one", () => {
    expect(entry({ format: "numeric" }, 1234567)).not.toBe("1234567");
  });

  it("keeps the places it was told to keep", () => {
    expect(entry({ format: "numeric", decimals: 2 }, 3)).toContain("3.00");
  });

  it("shows an amount in the currency the form declared", () => {
    const shown = entry({ format: "money", currency: "EUR" }, 12.5);

    expect(shown).toMatch(/12[.,]50/);
    expect(shown).toMatch(/€|EUR/);
  });
});

describe("a rule the value does not fit", () => {
  it("shows the value rather than the word Invalid", () => {
    expect(entry({ format: "dateTime" }, "not a date")).toBe("not a date");
  });

  it("survives a timezone the runtime has never heard of", () => {
    // `Intl` throws on one. One entry may not take the page with it.
    expect(
      entry(
        { format: "dateTime", timezone: "Mars/Olympus" },
        "2026-06-15T08:00:00.000Z",
      ),
    ).toBe("2026-06-15T08:00:00.000Z");
  });

  it("survives a currency code that is not one", () => {
    expect(entry({ format: "money", currency: "nope" }, 12.5)).toBe("12.5");
  });

  it("says nothing is there when the value is missing, rule or no rule", () => {
    expect(entry({ format: "money", currency: "EUR" })).toBe("—");
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
