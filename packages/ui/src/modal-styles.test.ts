/**
 * What the stylesheet promises about a modal.
 *
 * Read from the source, because jsdom computes no layout: a rendered dialog
 * measures zero and would vouch for any rule at all. The same approach
 * `target-size.test.ts` and `tokens-defined.test.ts` take, and for the same
 * reason.
 *
 * The rule worth holding is the one nearly shipped wrong. A width crosses the
 * wire as a word; the boot refuses a word that is not one of the ten, and this
 * is that check from the other side — a word the boot admits and the stylesheet
 * has no rule for opens the default panel with nothing to say the declaration
 * was ignored.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODAL_WIDTHS } from "@perchjs/core";

const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

/** The body of a rule, or nothing where there is no such rule. */
function ruleFor(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(STYLES)?.[1];
}

describe("every width a resource may declare", () => {
  it.each([...MODAL_WIDTHS])("%s has a rule of its own", (width) => {
    const rule = ruleFor(`.perch-modal[data-width="${width}"]`);

    expect(rule, `no rule for data-width="${width}"`).toBeDefined();
  });

  it("is a ceiling rather than a width, so the largest still fits a phone", () => {
    // Each is the smaller of its own size and what the window has. Without the
    // second half, `7xl` on a 375px screen is a page that scrolls sideways.
    const rule = ruleFor(".perch-modal[data-width]");

    expect(rule).toContain("min(var(--perch-modal-width)");
    expect(rule).toContain("100vw");
  });

  it("except the one that is the window, which promises no margin", () => {
    const rule = ruleFor('.perch-modal[data-width="screen"]');

    expect(rule).toContain("100vw");
    expect(rule).toContain("100vh");
  });
});

describe("a modal that opens against the side", () => {
  const rule = ruleFor('.perch-modal[data-slide-over="true"]');

  it("sits against it, and stands the full height", () => {
    expect(rule).toContain("margin: 0 0 0 auto");
    expect(rule).toContain("100dvh");
  });

  it("puts its footer at the foot rather than under the fields", () => {
    // Left alone the button lands halfway up an empty column, which reads as a
    // panel that failed to finish rather than one with room to spare.
    expect(
      ruleFor('.perch-modal[data-slide-over="true"] .perch-form-actions'),
    ).toContain("margin-top: auto");
  });

  it("arrives from off screen only where that was not asked against", () => {
    // Motion is a thing some people have told their machine they do not want,
    // and a panel sliding in is motion.
    const guarded =
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?perch-slide-in/;

    expect(STYLES).toMatch(guarded);
  });

  it("names an animation the stylesheet defines", () => {
    // A `@keyframes` that does not exist is an animation that silently does
    // nothing, which is exactly what it looks like when it works.
    expect(STYLES).toContain("@keyframes perch-slide-in");
  });
});

describe("the way out of a dialog holding a form", () => {
  it("is a target a finger can hit", () => {
    // A form ignores a click on the backdrop on purpose, so this and Escape are
    // the only ways out — and on a touch screen there is no Escape.
    const rule = ruleFor(".perch-modal__close");

    expect(rule).toContain("min-width: 24px");
    expect(rule).toContain("min-height: 24px");
  });

  it("is a bigger one where the pointer is a finger", () => {
    // On a phone a slide-over fills the screen, the backdrop is gone with it,
    // and this corner is the only thing left to press.
    const coarse =
      /@media \(pointer: coarse\) \{[\s\S]*?\.perch-modal__close \{[\s\S]*?\n {2}\}/.exec(
        STYLES,
      );

    expect(coarse?.[0], "no coarse-pointer rule for the close button").toContain(
      "44px",
    );
  });
});
