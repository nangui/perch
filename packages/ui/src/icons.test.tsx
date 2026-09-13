/**
 * @vitest-environment jsdom
 */
/**
 * Every name the core lets a resource ask for resolves to a drawing.
 *
 * The boot refuses a name the panel cannot draw, which is only worth anything
 * if the set of names and the set of drawings are the same set. `Record<
 * IconName, …>` already fails the build when a name has no drawing, so what is
 * left to hold here is the other direction and the silence: that a name
 * arriving from somewhere the boot never saw draws nothing, rather than
 * printing `chevron-down` in the middle of a heading.
 *
 * The value import of the core is what a test may do and the package may not:
 * `@perchjs/ui` depends on it for types only, and this is the one place that
 * needs the names themselves to check them off.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ICON_NAMES } from "@perchjs/core";
import { IconMark } from "./icons.js";

afterEach(cleanup);

/** The mark a surface would get, or null. */
function mark(name: string | undefined): SVGSVGElement | null {
  return render(
    <IconMark name={name} className="perch-layout__icon" />,
  ).container.querySelector("svg");
}

describe("a name a resource asked for", () => {
  it.each(ICON_NAMES)("draws %s", (name) => {
    const drawn = mark(name);

    expect(drawn, `no drawing for ${name}`).not.toBeNull();
    expect(drawn?.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
    // A shape, never a character: the whole complaint against a glyph was that
    // the font chose it.
    expect(drawn?.textContent).toBe("");
  });

  it("is drawn in one box at one weight, whichever name it was", () => {
    const boxes = new Set(
      ICON_NAMES.map((name) => mark(name)?.getAttribute("viewBox")),
    );
    const weights = new Set(
      ICON_NAMES.map((name) => mark(name)?.getAttribute("stroke-width")),
    );

    // The promise the name makes: a mark on a tab and a mark on a heading are
    // the same shape at the same weight whoever declared them.
    expect([...boxes]).toEqual(["0 0 16 16"]);
    expect(weights.size).toBe(1);
  });

  it("takes its colour from whatever it sits in", () => {
    // A mark carrying a colour of its own would keep it through a hover, a
    // disabled control and both ramps, which is what an emoji did. Anything
    // painted is painted `currentColor`; anything left unpainted says `none`.
    const painted = ICON_NAMES.flatMap((name) => {
      const drawn = mark(name);
      if (drawn === null) return [];
      return [drawn, ...drawn.querySelectorAll("*")].flatMap((shape) =>
        ["fill", "stroke"]
          .map((property) => shape.getAttribute(property))
          .filter((value): value is string => value !== null),
      );
    });

    expect(painted.length).toBeGreaterThan(ICON_NAMES.length);
    expect([...new Set(painted)].sort()).toEqual(["currentColor", "none"]);
  });
});

describe("a name the panel has no drawing for", () => {
  it("draws nothing at all", () => {
    // Not the word. This is the plugin written in JavaScript, and the metadata
    // that never went past the boot — a heading with `aubergine` printed in it
    // is worse than a heading with no mark.
    expect(mark("aubergine")).toBeNull();
  });

  it("draws nothing when a surface asked for no mark", () => {
    expect(mark(undefined)).toBeNull();
  });
});

describe("the mark itself", () => {
  it("is hidden from a screen reader", () => {
    // It sits beside a word that says the same thing. Announced, it says it
    // twice; announced instead of the word, it is decoration standing in for a
    // name.
    expect(mark("tag")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries the surface's own class beside its own", () => {
    // The surface names where the mark is; `perch-icon` is what sizes it and
    // takes it off the text baseline. Both, because neither does the other's
    // job.
    const drawn = mark("tag");

    expect(drawn?.getAttribute("class")).toContain("perch-icon");
    expect(drawn?.getAttribute("class")).toContain("perch-layout__icon");
  });
});
