/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

function payload(
  value: unknown,
  extra: Partial<{ required: boolean; disabled: boolean; placeholder: string }> = {},
): SchemaPayload {
  return {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "accepted",
          type: "Checkbox",
          path: "accepted",
          label: "Terms",
          ...extra,
        },
      ],
    },
    state: { accepted: value },
    errors: {},
  };
}

function draw(value: unknown, extra = {}): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  resetRegistry();
  registerBuiltInComponents();
  render(<SchemaRenderer payload={payload(value, extra)} onChange={onChange} />);
  return onChange;
}

describe("the control", () => {
  it("is a real checkbox, so the platform drives it", () => {
    draw(false);

    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  it("is named by its label", () => {
    draw(false);

    expect(screen.getByRole("checkbox", { name: "Terms" })).toBeTruthy();
  });

  it("reads as ticked when it is", () => {
    draw(true);

    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
  });

  it("reads as unticked for a column never written", () => {
    // Anything but `true` is off: a box cannot be half on, and null is what an
    // untouched column holds.
    draw(null);

    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  });
});

describe("ticking", () => {
  it("reports a boolean, not the string a form would send", () => {
    const onChange = draw(false);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith("accepted", true);
  });

  it("reports unticking too", () => {
    const onChange = draw(true);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith("accepted", false);
  });
});

describe("a locked box", () => {
  it("keeps its state visible rather than clearing it", () => {
    draw(true, { disabled: true });

    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });

  // Whether clicking it does nothing is the platform's to enforce, and the
  // `disabled` asserted above is what asks for that. jsdom dispatches the
  // event without the activation behaviour a browser applies, so asserting it
  // here would be asserting something about jsdom.
});

describe("what it says about being required", () => {
  it("carries it to the control, not only to the label", () => {
    draw(false, { required: true });

    expect(screen.getByRole("checkbox").getAttribute("aria-required")).toBe("true");
  });
});

describe("a value that is not a boolean at all", () => {
  it("reads as unticked even when it is truthy", () => {
    // The first render comes from the row, not through the trust boundary: a
    // legacy column holding `1` reaches here untouched. `Boolean(1)` would tick
    // a box the database never said was ticked.
    draw(1);

    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  });

  it("reads a string the same way", () => {
    draw("yes");

    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  });
});

describe("`.inlineLabel()`", () => {
  it("marks the field, which is what the layout hangs off", () => {
    resetRegistry();
    registerBuiltInComponents();
    render(
      <SchemaRenderer
        payload={{
          schema: {
            id: "0",
            type: "Schema",
            children: [
              {
                id: "accepted",
                type: "Checkbox",
                path: "accepted",
                label: "Terms",
                inlineLabel: true,
              },
            ],
          },
          state: { accepted: false },
          errors: {},
        }}
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector('.perch-field[data-inline="true"]')).not.toBeNull();
  });

  it("leaves the field alone when it was not asked for", () => {
    draw(false);

    expect(document.querySelector('.perch-field[data-inline="true"]')).toBeNull();
  });

  it("keeps one label for one control, however it is laid out", () => {
    // Two labels for one input are read as one long name.
    draw(false);

    expect(screen.getAllByText("Terms")).toHaveLength(1);
  });
});

describe("every other field", () => {
  it("is not laid out inline just because a checkbox can be", () => {
    // Nothing but the checkbox passes `inline` at all, so the shell's default
    // is what keeps the rest of the panel stacked.
    resetRegistry();
    registerBuiltInComponents();
    render(
      <SchemaRenderer
        payload={{
          schema: {
            id: "0",
            type: "Schema",
            children: [
              { id: "title", type: "TextInput", path: "title", label: "Title" },
            ],
          },
          state: { title: "" },
          errors: {},
        }}
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector("[data-inline]")).toBeNull();
  });
});
