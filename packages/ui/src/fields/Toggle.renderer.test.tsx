/**
 * @vitest-environment jsdom
 *
 * The switch, reached the way a panel reaches it.
 *
 * The component itself has been here and tested for a while; what it never had
 * was a field declaring it or a registry entry pointing at it, so no form could
 * put one on a page. These are about that path.
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
          id: "live",
          type: "Toggle",
          path: "live",
          label: "Published",
          ...(Object.keys(props).length === 0 ? {} : { props }),
          ...extra,
        },
      ],
    },
    state: { live: value },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={onChange} />);
  return onChange;
}

describe("a Toggle a form declared", () => {
  it("reaches the page at all", () => {
    // It could not before: nothing registered a renderer for the type.
    draw(false);

    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("is a switch and not a checkbox, which is the whole difference", () => {
    draw(false);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("is named by its label", () => {
    draw(false);

    expect(screen.getByRole("switch", { name: "Published" })).toBeTruthy();
  });

  it("reads as on when it is", () => {
    draw(true);

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("reads as off for a column never written", () => {
    draw(null);

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("reads as off for a truthy value that is not a boolean", () => {
    // The first render comes from the row rather than through the boundary, so
    // a legacy column holding `1` arrives untouched.
    draw(1);

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });
});

describe("flipping it", () => {
  it("reports a boolean", () => {
    const onChange = draw(false);

    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith("live", true);
  });

  it("reports turning it off too", () => {
    const onChange = draw(true);

    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith("live", false);
  });
});

describe("what the declaration draws", () => {
  /** The one mark in the knob, whichever of the two it is drawing. */
  const knobMark = (): SVGSVGElement | null =>
    document.querySelector(".perch-toggle__icon");

  it("puts the on mark in the knob when on, and only that one", () => {
    draw(true, { onIcon: "check", offIcon: "close" });

    expect(knobMark()?.tagName.toLowerCase()).toBe("svg");
    // One knob, one mark: the other state's is not drawn and hidden, it is not
    // drawn at all.
    expect(document.querySelectorAll(".perch-toggle__icon")).toHaveLength(1);
  });

  it("puts the off one there when off", () => {
    draw(false, { onIcon: "check", offIcon: "close" });

    expect(knobMark()?.tagName.toLowerCase()).toBe("svg");
  });

  it("draws nothing where the state it is in named no mark", () => {
    // On with only an off mark declared: the knob is empty rather than
    // borrowing the other state's.
    draw(true, { offIcon: "close" });

    expect(knobMark()).toBeNull();
  });

  it("hides the mark from the accessible name, being decoration", () => {
    // The role and the state already say it; a mark read aloud says it twice
    // and in a language nobody chose.
    draw(true, { onIcon: "check" });

    expect(knobMark()?.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks the track with the colour it was told", () => {
    draw(true, { onColor: "success" });

    expect(screen.getByRole("switch").getAttribute("data-on-color")).toBe("success");
  });

  it("marks nothing when no colour was asked for", () => {
    draw(true);

    expect(screen.getByRole("switch").getAttribute("data-on-color")).toBeNull();
  });
});

describe("one label, one help line", () => {
  it("does not wrap the control in a shell that would repeat both", () => {
    draw(false, {}, { helperText: "Visible to readers" });

    expect(screen.getAllByText("Published")).toHaveLength(1);
    expect(screen.getAllByText("Visible to readers")).toHaveLength(1);
  });
});

describe("a switch a form made mandatory", () => {
  it("says so on the control, not only in the validation", () => {
    // The server enforces it either way; a reader who is never told cannot
    // know before they submit.
    draw(false, {}, { required: true });

    expect(screen.getByRole("switch").getAttribute("aria-required")).toBe("true");
  });

  it("says nothing when it is not", () => {
    draw(false);

    expect(screen.getByRole("switch").getAttribute("aria-required")).toBeNull();
  });
});
