/**
 * @vitest-environment jsdom
 *
 * What a colour entry draws, and what it refuses to put in a style.
 *
 * The patch is the only place in an infolist where a value out of a row is
 * handed to the browser as an instruction rather than as words. That is the
 * whole reason this file exists: everything else here is two spans.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "../SchemaRenderer.js";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";

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
        { id: "one", type: "ColorEntry", path: "tint", label: "Tint", ...node },
      ],
    },
    state: {},
    errors: {},
  };
  return render(<SchemaRenderer payload={payload} onChange={vi.fn()} />).container;
};

const swatch = (container: HTMLElement): HTMLElement | null =>
  container.querySelector(".perch-entry__swatch");

describe("a colour", () => {
  it("is shown as a patch and as the notation that made it", () => {
    const container = draw({ value: "#1e88e5" });

    expect(swatch(container)?.style.background).toBe("rgb(30, 136, 229)");
    expect(container.querySelector(".perch-entry__code")?.textContent).toBe("#1e88e5");
  });

  it("keeps the notation it was stored in rather than converting it", () => {
    // A value that reads differently from what was stored is one somebody
    // pastes back wrong.
    for (const said of ["hsl(210, 80%, 50%)", "rgb(30 136 229)", "#1E88E5"]) {
      cleanup();
      expect(
        draw({ value: said }).querySelector(".perch-entry__code")?.textContent,
      ).toBe(said);
    }
  });

  it("says nothing out loud about the patch, the code being the words", () => {
    expect(swatch(draw({ value: "#1e88e5" }))?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});

describe("a value that is not a colour", () => {
  it("is never put where a browser would obey it", () => {
    // The row held a request to somewhere nobody chose. Shown as words — which
    // fetches nothing and is what the reader needs to see — but never in a
    // `style`, which is the one place on this page a value is an instruction.
    const container = draw({ value: "url(https://tracker.example/pixel.png)" });

    expect(swatch(container)).toBeNull();
    for (const el of container.querySelectorAll("[style]")) {
      expect(el.getAttribute("style")).not.toContain("tracker.example");
    }
    expect(container.querySelector(".perch-entry__code")?.textContent).toBe(
      "url(https://tracker.example/pixel.png)",
    );
  });

  it("is drawn as the words it is, so the reader sees what is stored", () => {
    const container = draw({ value: "cornflower" });

    expect(container.querySelector(".perch-entry__code")?.textContent).toBe(
      "cornflower",
    );
    expect(swatch(container)).toBeNull();
  });

  it("gets no patch for a notation that is only nearly one", () => {
    for (const said of ["#12", "#1234", "#gggggg", "rgb(0,0,0", "var(--brand)"]) {
      cleanup();
      expect(swatch(draw({ value: said }))).toBeNull();
    }
  });

  it("draws the placeholder where the row held nothing", () => {
    for (const value of ["", "   ", null, undefined, 7]) {
      cleanup();
      const container = draw({ value, placeholder: "No tint" });
      expect(container.querySelector(".perch-entry")?.textContent).toBe("No tint");
      expect(swatch(container)).toBeNull();
    }
  });
});

describe("the copy button", () => {
  // jsdom carries no clipboard, and a button with nothing to write to is a
  // button this component correctly declines to draw. Every case below is
  // about the flag, so each gives it one to write to.
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is there only where the entry asked for one", () => {
    expect(draw({ value: "#1e88e5" }).querySelector(".perch-entry__copy")).toBeNull();
    cleanup();
    expect(
      draw({ value: "#1e88e5", props: { copyable: true } }).querySelector(
        ".perch-entry__copy",
      ),
    ).not.toBeNull();
  });

  it("is named for the entry, not for the value", () => {
    draw({ value: "#1e88e5", props: { copyable: true } });

    expect(screen.getByLabelText("Copy Tint")).toBeTruthy();
  });

  it("copies what is stored, including a value that got no patch", () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    draw({ value: "cornflower", props: { copyable: true } });
    screen.getByLabelText("Copy Tint").click();

    expect(writeText).toHaveBeenCalledWith("cornflower");
  });

  it("is not drawn where a row held nothing to copy", () => {
    expect(
      draw({ value: "", props: { copyable: true } }).querySelector(
        ".perch-entry__copy",
      ),
    ).toBeNull();
  });
});
