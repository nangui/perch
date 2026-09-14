/**
 * @vitest-environment jsdom
 *
 * Where a label says it points, and whether anything is there.
 *
 * `label for` reaches a labelable element — a `button`, an `input`, a `select`,
 * a `textarea` — and nothing else. Pointed at a paragraph, a table or a
 * contenteditable it is inert: the element has no name, and the markup says it
 * has one, which is the kind of wrong that no test catches by looking at a
 * screen. Seven components did it, five of them infolist entries, and the
 * screen was correct in every one.
 *
 * Every registered type is rendered rather than a chosen few, because the one
 * that would get this wrong next is the one nobody thought to list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "./SchemaRenderer.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
  cleanup();
});

/** https://html.spec.whatwg.org/multipage/forms.html#category-label */
const LABELABLE = new Set([
  "button",
  "input",
  "meter",
  "output",
  "progress",
  "select",
  "textarea",
]);

/** Every type the renderer registers, read from the registration itself. */
function everyType(): readonly string[] {
  const src = readFileSync(`${process.cwd()}/packages/ui/src/renderers.tsx`, "utf8");
  return [...src.matchAll(/registerComponent\("([A-Za-z]+)"/g)].map((one) =>
    String(one[1]),
  );
}

function drawn(type: string): HTMLElement {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "one",
          type,
          path: "f",
          label: "Name",
          // Enough for the ones that draw from a list; ignored by the rest.
          options: [{ value: "a", label: "A" }],
        },
      ],
    },
    state: { f: "" },
    errors: {},
  };
  return render(<SchemaRenderer payload={payload} onChange={vi.fn()} />).container;
}

describe("the label a field shell writes", () => {
  it("is a `label` only where a `for` can reach what is inside", () => {
    const inert: string[] = [];

    for (const type of everyType()) {
      cleanup();
      const container = drawn(type);
      const label = container.querySelector("label.perch-field__label-text");
      const points = label?.getAttribute("for");
      if (points === undefined || points === null) continue;

      const at = container.querySelector(`[id="${points}"]`);
      const tag = at === null ? "nothing" : at.tagName.toLowerCase();
      if (!LABELABLE.has(tag)) inert.push(`${type} → ${tag}`);
    }

    expect(inert).toEqual([]);
  });

  it("is a heading with a name of its own where it cannot", () => {
    // Not simply dropped: something that admits a name — a table, a textbox —
    // needs an id to point at, and a reader needs the words either way.
    cleanup();
    const container = drawn("TextEntry");
    const heading = container.querySelector("span.perch-field__label-text");

    expect(heading?.textContent).toBe("Name");
    expect(heading?.id).not.toBe("");
    expect(container.querySelector("label.perch-field__label-text")).toBeNull();
  });

  it("still marks a required field, bound or not", () => {
    // The asterisk is not part of the binding, and a required editor is
    // required whether or not a `for` reaches it.
    const payload: SchemaPayload = {
      schema: {
        id: "0",
        type: "Schema",
        children: [
          {
            id: "one",
            type: "RichEditor",
            path: "f",
            label: "Body",
            required: true,
          },
        ],
      },
      state: { f: null },
      errors: {},
    };
    const { container } = render(
      <SchemaRenderer payload={payload} onChange={vi.fn()} />,
    );

    expect(container.querySelector(".perch-field__required")?.textContent).toBe("*");
  });
});
