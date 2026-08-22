/**
 * @vitest-environment jsdom
 *
 * What a choice carries, from the wire to the control.
 *
 * `Option` says more than a word: `disabled` is the server declaring it will
 * not take that value, and `meta` is the annotation beside it. Both were sent
 * and every renderer dropped them on the way in, so a control drew a set the
 * reader could pick anything from — a declaration nothing acted on, which is
 * the shape of mistake this repository keeps finding.
 *
 * Asked through the registry rather than of a component, because the mistake
 * was in the mapping between the two: a test handing the prop straight to a
 * component passes while nothing on any page ever sends it.
 */
import type { SchemaPayload } from "@perchjs/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/** The choices every field below is given: one open, one the server closed. */
const OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "guest", label: "Guest", disabled: true },
];

function payload(type: string, props: Record<string, unknown> = {}): SchemaPayload {
  return {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        { id: "role", type, path: "role", label: "Role", options: OPTIONS, props },
      ],
    },
    state: {},
    errors: {},
  };
}

function draw(type: string, props?: Record<string, unknown>): void {
  resetRegistry();
  registerBuiltInComponents();
  render(<SchemaRenderer payload={payload(type, props)} onChange={vi.fn()} />);
}

describe("an option the server disabled", () => {
  it.each([
    ["Radio", "radio"],
    ["ToggleButtons", "radio"],
    ["CheckboxList", "checkbox"],
  ])("is out of reach in a %s, and the others are not", (type, role) => {
    draw(type);

    // Matched loosely, because the shell's label points at the first control
    // as well and two labels make one name: "Role Lead".
    expect(screen.getByRole(role, { name: /Lead/ })).toHaveProperty("disabled", false);
    expect(screen.getByRole(role, { name: /Guest/ })).toHaveProperty("disabled", true);
  });
});

describe("what an option says beside itself", () => {
  it("reaches the control that draws it", () => {
    // A `Select` renders `meta` right-aligned in its list, and until the
    // mapping kept it there was no way for one to arrive.
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
                id: "plan",
                type: "Select",
                path: "plan",
                label: "Plan",
                options: [{ value: "pro", label: "Pro", meta: "£20" }],
                props: { searchable: false, multiple: false },
              },
            ],
          },
          state: { plan: "pro" },
          errors: {},
        }}
        onChange={vi.fn()}
      />,
    );

    // In the list rather than on the trigger, which is where the annotation
    // belongs: it is what tells two similar choices apart.
    fireEvent.click(screen.getByRole("combobox", { name: "Plan" }));

    expect(screen.getByText("£20")).toBeTruthy();
  });
});
