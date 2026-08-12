/**
 * @vitest-environment jsdom
 *
 * The long-text box, reached the way a panel reaches it.
 *
 * The component had been here with no field declaring it and no registry entry
 * pointing at it, so no form could put one on a page.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

function draw(
  value: unknown,
  props: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  resetRegistry();
  registerBuiltInComponents();
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "body",
          type: "Textarea",
          path: "body",
          label: "Body",
          ...(Object.keys(props).length === 0 ? {} : { props }),
          ...extra,
        },
      ],
    },
    state: { body: value },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={onChange} />);
  return onChange;
}

const box = (): HTMLTextAreaElement => screen.getByRole<HTMLTextAreaElement>("textbox");

describe("a Textarea a form declared", () => {
  it("reaches the page at all", () => {
    draw("");

    expect(box().tagName).toBe("TEXTAREA");
  });

  it("is named by its label", () => {
    draw("");

    expect(screen.getByRole("textbox", { name: "Body" })).toBeTruthy();
  });

  it("shows what the row holds", () => {
    draw("Once upon a time");

    expect(box().value).toBe("Once upon a time");
  });

  it("shows nothing for a column never written", () => {
    draw(null);

    expect(box().value).toBe("");
  });

  it("reports what was typed", () => {
    const onChange = draw("");

    fireEvent.change(box(), { target: { value: "written" } });

    expect(onChange).toHaveBeenCalledWith("body", "written");
  });
});

describe("what the declaration asks for", () => {
  it("starts as tall as it was told", () => {
    draw("", { rows: 8 });

    expect(box().getAttribute("rows")).toBe("8");
  });

  it("marks itself when it grows with its content", () => {
    draw("", { autosize: true, rows: 3 });

    expect(box().getAttribute("data-autosize")).toBe("true");
  });

  it("is not marked when it was not asked to", () => {
    draw("", { rows: 3 });

    expect(box().getAttribute("data-autosize")).toBeNull();
  });
});

describe("the count", () => {
  it("says where the text stands against the limit", () => {
    draw("abc", { maxLength: 10 });

    expect(screen.getByText("3 / 10")).toBeTruthy();
  });

  it("keeps counting past the limit rather than clipping", () => {
    // Over the limit is an error, not a silent truncation: the reader has to
    // see what they wrote in order to cut it down.
    draw("abcdef", { maxLength: 3 });

    expect(screen.getByText("6 / 3")).toBeTruthy();
    expect(box().value).toBe("abcdef");
  });

  it("says nothing at all when no limit was declared", () => {
    draw("abc");

    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
  });
});

describe("the count and the rule", () => {
  it("counts a grapheme once, as the server does", () => {
    // A family emoji is seven UTF-16 units and one character. Counting seven
    // would say "too long" over a field the server saves without complaint.
    draw("👨‍👩‍👧", { maxLength: 1 });

    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.queryByText("Too long")).toBeNull();
  });

  it("still says too long when it really is", () => {
    draw("👨‍👩‍👧👋", { maxLength: 1 });

    expect(screen.getByText("2 / 1")).toBeTruthy();
    expect(screen.getByText("Too long")).toBeTruthy();
  });
});
