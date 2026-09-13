/**
 * @vitest-environment jsdom
 */
/**
 * How much of its row a field was told to take.
 *
 * Declared since layouts existed, sent on every node that asked, and read by
 * nothing: a form saying `columnSpan(2)` drew a field one column wide, and the
 * declaration was a line somebody wrote and nobody honoured. The props guard
 * cannot see this one — it asks about `props`, and this rides on the node
 * itself.
 */
import { cleanup, render } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerBuiltInComponents } from "./renderers.js";
import { SchemaRenderer } from "./SchemaRenderer.js";

afterEach(cleanup);
beforeAll(() => {
  registerBuiltInComponents();
});

function draw(span?: number | "full"): HTMLElement {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      props: { columns: 2 },
      children: [
        {
          id: "wide",
          type: "TextInput",
          path: "title",
          label: "Title",
          ...(span === undefined ? {} : { columnSpan: span }),
        },
      ],
    },
    state: {},
    errors: {},
  };
  return render(<SchemaRenderer payload={payload} onChange={() => undefined} />).container;
}

describe("a field that asked for room", () => {
  it("is given a grid item of its own, carrying the number it asked for", () => {
    const wrapper = draw(2).querySelector(".perch-span");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("style")).toContain("--perch-span: 2");
    // The field is inside it, not beside it.
    expect(wrapper?.querySelector("input")).not.toBeNull();
  });

  it("asks for the whole row by name rather than by a count", () => {
    // How many columns there are is the grid's answer and it changes on a
    // narrow screen. A number here would claim columns nobody drew.
    const wrapper = draw("full").querySelector(".perch-span");

    expect(wrapper?.getAttribute("data-span")).toBe("full");
    expect(wrapper?.getAttribute("style")).toBeNull();
  });

  it("gains no element at all when it asked for nothing", () => {
    // Every field that already draws is a field that must draw the same.
    expect(draw().querySelector(".perch-span")).toBeNull();
  });
});
