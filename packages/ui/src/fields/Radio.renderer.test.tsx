/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Option, SchemaPayload } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

const CHOICES = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
];

function draw(
  value: unknown,
  node: Record<string, unknown> = {},
  options: readonly Option[] = CHOICES,
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
          id: "status",
          type: "Radio",
          path: "status",
          label: "Status",
          options,
          props: { inline: false },
          ...node,
        },
      ],
    },
    state: { status: value },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={onChange} />);
  return onChange;
}

describe("a Radio a form declared", () => {
  it("reaches the page as a group", () => {
    draw(null);

    expect(screen.getByRole("radiogroup", { name: "Status" })).toBeTruthy();
  });

  it("shows every choice at once, which is the whole point of it", () => {
    draw(null);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("uses real inputs, so the browser gives the group its arrow keys", () => {
    draw(null);

    const [first, second] = screen.getAllByRole<HTMLInputElement>("radio");
    expect(first?.tagName).toBe("INPUT");
    // One shared name is what makes them one group rather than two controls.
    expect(first?.name).toBe(second?.name);
    expect(first?.name).not.toBe("");
  });

  it("marks the one the row holds", () => {
    draw("live");

    const [draft, live] = screen.getAllByRole<HTMLInputElement>("radio");
    expect(draft?.checked).toBe(false);
    expect(live?.checked).toBe(true);
  });

  it("marks none for a column never written", () => {
    draw(null);

    expect(
      screen.getAllByRole<HTMLInputElement>("radio").filter((one) => one.checked),
    ).toHaveLength(0);
  });
});

describe("picking one", () => {
  it("reports the value that was declared", () => {
    const onChange = draw(null);

    fireEvent.click(screen.getByLabelText("Live"));

    expect(onChange).toHaveBeenCalledWith("status", "live");
  });
});

describe("how the choices are laid out", () => {
  it("marks the group when they go in a row", () => {
    draw(null, { props: { inline: true } });

    expect(screen.getByRole("radiogroup").getAttribute("data-inline")).toBe("true");
  });

  it("leaves it alone when they do not", () => {
    draw(null);

    expect(screen.getByRole("radiogroup").getAttribute("data-inline")).toBeNull();
  });

  it("keeps that apart from where the label sits", () => {
    // Two decisions, two names. `inlineLabel` moves the label; `inline` moves
    // the choices.
    draw(null, { inlineLabel: true });

    expect(document.querySelector('.perch-field[data-inline="true"]')).not.toBeNull();
    expect(screen.getByRole("radiogroup").getAttribute("data-inline")).toBeNull();
  });
});

describe("with nothing to offer", () => {
  it("says so and keeps its place in the layout", () => {
    // A field that vanishes is a field nobody can ask about, and the row below
    // it would move.
    draw(null, {}, []);

    const said = screen.getByText("No options available");
    // Rendered, not merely present: `getByText` finds a hidden node too, and a
    // hidden one is exactly the failure this is about.
    expect(said.closest("[hidden]")).toBeNull();
    // The control-shaped wrapper is what holds the row open; the message alone
    // in a bare span would let everything below it move up.
    expect(said.closest(".perch-radio")).not.toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("being required", () => {
  it("says so on the group, not only on the label", () => {
    draw(null, { required: true });

    expect(screen.getByRole("radiogroup").getAttribute("aria-required")).toBe("true");
  });
});
