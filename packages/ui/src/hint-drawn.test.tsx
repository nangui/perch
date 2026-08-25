/**
 * @vitest-environment jsdom
 *
 * What surrounds a control, once it has crossed.
 *
 * Both halves were already half-built and quiet about it: the shell had a slot
 * beside the label and nothing to put in it, and the text control had drawn
 * `prefix` and `suffix` since it was written with nothing ever passing them.
 * A prop drawn by a component and fed by no renderer looks exactly like one
 * that works, from every angle except the page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "./SchemaRenderer.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
  cleanup();
});

const draw = (node: Record<string, unknown>): HTMLElement => {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        { id: "one", type: "TextInput", path: "site", label: "Site", ...node },
      ],
    },
    state: { site: "" },
    errors: {},
  };
  const { container } = render(<SchemaRenderer payload={payload} onChange={vi.fn()} />);
  return container;
};

describe("a hint", () => {
  it("is drawn beside the label, not on the line under the control", () => {
    const container = draw({ hint: "lowercase, no spaces" });

    expect(container.querySelector(".perch-field__hint")?.textContent).toBe(
      "lowercase, no spaces",
    );
    // The line under the control is reserved and stays empty for the error.
    expect(container.querySelector(".perch-field__help")?.textContent).toBe("");
  });

  it("shares the line with the error rather than being replaced by it", () => {
    // Which is the whole reason it is not on the line below. A reader who has
    // got something wrong needs the instruction most.
    const payload: SchemaPayload = {
      schema: {
        id: "0",
        type: "Schema",
        children: [
          {
            id: "one",
            type: "TextInput",
            path: "site",
            label: "Site",
            hint: "lowercase, no spaces",
          },
        ],
      },
      state: { site: "Ada" },
      errors: { site: "Must be lowercase." },
    };
    const { container } = render(
      <SchemaRenderer payload={payload} onChange={vi.fn()} />,
    );

    expect(container.querySelector(".perch-field__hint")?.textContent).toBe(
      "lowercase, no spaces",
    );
    expect(container.querySelector(".perch-field__help")?.textContent).toBe(
      "Must be lowercase.",
    );
  });

  it("carries its glyph without saying it out loud", () => {
    const container = draw({ hint: "kept secret", hintIcon: "🔒" });
    const icon = container.querySelector(".perch-field__hint-icon");

    expect(icon?.textContent).toBe("🔒");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is nothing at all where a field declared none", () => {
    expect(draw({}).querySelector(".perch-field__hint")).toBeNull();
  });
});

describe("an attribute a declaration asks for", () => {
  it("lands on the control", () => {
    const container = draw({ extraAttributes: { "data-tour": "slug", title: "The URL" } });
    const box = container.querySelector("input");

    expect(box?.getAttribute("data-tour")).toBe("slug");
    expect(box?.getAttribute("title")).toBe("The URL");
  });

  it("cannot take the bindings the label and the help line point at", () => {
    // The boot refuses the attributes that instruct a browser. This is the
    // other half: one that only describes can still describe the wrong thing,
    // and an `id` out of a resource would leave the label pointing at nothing.
    const container = draw({
      extraAttributes: { id: "stolen", "aria-describedby": "elsewhere" },
    });
    const box = container.querySelector("input");

    expect(box?.id).not.toBe("stolen");
    expect(box?.getAttribute("aria-describedby")).not.toBe("elsewhere");
    expect(screen.getByLabelText("Site")).toBe(box);
  });

  it("puts the cursor where a field asked for it", () => {
    // React focuses the element rather than writing the attribute, so what
    // proves it is where the cursor ended up and not what the tag says.
    const asked = draw({ autofocus: true });

    expect(document.activeElement).toBe(asked.querySelector("input"));
    cleanup();
    expect(document.activeElement).not.toBe(draw({}).querySelector("input"));
  });
});

describe("an affix", () =>{

  it("is drawn inside the frame, on the side it was declared", () => {
    const container = draw({ props: { prefix: "https://", suffix: ".com" } });

    expect(container.querySelector(".perch-control__affix--prefix")?.textContent).toBe(
      "https://",
    );
    expect(container.querySelector(".perch-control__affix--suffix")?.textContent).toBe(
      ".com",
    );
  });

  it("takes a glyph beside the words, or instead of them", () => {
    const container = draw({ props: { prefixIcon: "🌐", suffixIcon: "✓" } });

    expect(container.querySelector(".perch-control__affix--prefix")?.textContent).toBe(
      "🌐",
    );
    expect(container.querySelector(".perch-control__affix--suffix")?.textContent).toBe(
      "✓",
    );
  });

  it("says nothing out loud, the label and the hint being the words", () => {
    // An affix repeated into every field's name is noise, and one carrying
    // meaning of its own would need words — and those words are the hint.
    const container = draw({ props: { prefix: "https://" } });

    expect(
      container
        .querySelector(".perch-control__affix--prefix")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("leaves the box alone where none was declared", () => {
    const container = draw({});

    expect(container.querySelector(".perch-control__affix--prefix")).toBeNull();
    expect(container.querySelector(".perch-control__affix--suffix")).toBeNull();
  });

  it("does not become part of what the reader types", () => {
    const container = draw({ props: { prefix: "https://" } });

    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(screen.getByLabelText("Site")).toBeTruthy();
  });
});
