/**
 * What the two ramps promise a reader who has to see them.
 *
 * Read from the source, because a colour is a value rather than a rendering:
 * jsdom computes no contrast, and a browser would only tell us about the one
 * ramp it happened to be showing.
 *
 * This exists because the dark ramp was derived from the light one rather than
 * designed, and it showed in numbers before it showed on a screen: a card sat
 * 1.07:1 from the page it was on, and a border 1.43:1 from the surface it was
 * drawn against — the same colour, to an eye. Nothing here would have said so.
 * Now something does, in both ramps, because the light one is one careless
 * value away from the same fault.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOKENS = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** The hex values one ramp declares, by token name. */
function ramp(which: "light" | "dark"): Readonly<Record<string, string>> {
  const at =
    which === "dark"
      ? TOKENS.indexOf('[data-perch-theme="dark"]')
      : TOKENS.indexOf(":where(:root)");
  expect(at, `no ${which} ramp where this looks`).toBeGreaterThan(-1);

  const block = TOKENS.slice(at, TOKENS.indexOf("\n}", at));
  return Object.fromEntries(
    [...block.matchAll(/--perch-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((found) => [
      found[1] ?? "",
      found[2] ?? "",
    ]),
  );
}

/** sRGB relative luminance, as WCAG defines it. */
function luminance(hex: string): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return (
    0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0)
  );
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((one, two) => two - one);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const RAMPS = ["light", "dark"] as const;

describe.each(RAMPS)("the %s ramp", (which) => {
  const tokens = ramp(which);
  const against = (name: string, ground: string): number => {
    const held = tokens[name];
    const on = tokens[ground];
    expect(held, `${which} declares no ${name}`).toBeDefined();
    expect(on, `${which} declares no ${ground}`).toBeDefined();
    return contrast(held ?? "#000000", on ?? "#ffffff");
  };

  it("carries text a reader can read", () => {
    // The threshold the guidelines set for body text, applied to every token
    // that ends up as words on a surface.
    for (const name of ["content", "content-secondary", "content-muted"]) {
      expect(against(name, "surface"), `${name} on surface`).toBeGreaterThanOrEqual(4.5);
    }
    // Subtle is for what a reader may skip past — a hint, a unit — so it is held
    // to what large text asks rather than to what body text does.
    expect(against("content-subtle", "surface")).toBeGreaterThanOrEqual(3);
  });

  it("draws a control's outline where somebody can see it", () => {
    // `border-strong` is the one that says where a control is, and that is the
    // boundary the guidelines are about. `border` and `border-subtle` are
    // dividers: they separate things that are already separate, and holding
    // them to the same figure made the dark ramp's separators twice the weight
    // of the light one's — which is the fault this file exists to catch.
    expect(against("border-strong", "surface")).toBeGreaterThanOrEqual(3);
  });

  it("keeps its dividers in step between the two ramps", () => {
    // Not a threshold but an agreement. A ramp that draws a heavier line than
    // its counterpart is a ramp somebody derived rather than drew.
    const other = ramp(which === "light" ? "dark" : "light");
    const mine = contrast(tokens["border"] ?? "", tokens["surface"] ?? "");
    const theirs = contrast(other["border"] ?? "", other["surface"] ?? "");

    expect(Math.abs(mine - theirs)).toBeLessThan(0.35);
  });

  it("separates a card from the page it sits on", () => {
    // Small numbers, because contrast compresses at both ends of the range and
    // a surface step is a step rather than a boundary. 1.07:1 — what the dark
    // ramp had — is no step at all.
    expect(against("surface", "surface-page")).toBeGreaterThanOrEqual(1.12);
  });

  it("lets a raised surface rise, where the ramp leaves it room", () => {
    // A raised surface moves toward the ramp's light end. In the light ramp a
    // card is already white and there is nowhere further to go, which is why
    // elevation there is carried by the shadow scale rather than by the tint —
    // so the rule is that it never recedes, and that it takes the step when one
    // is available.
    const surface = luminance(tokens["surface"] ?? "");
    const raised = luminance(tokens["surface-raised"] ?? "");

    expect(raised).toBeGreaterThanOrEqual(surface);
    if (surface < 0.9) {
      expect(against("surface-raised", "surface")).toBeGreaterThanOrEqual(1.05);
    }
  });

  it("carries its state colours where a reader has to read them", () => {
    // The colours that mean something — a warning, a failure, a success — and
    // that are read as words on their own tinted background as well as on a
    // plain surface. Left out when this file was written, and named as the gap
    // then: a status is exactly the thing somebody must be able to read.
    for (const state of ["warning", "success", "danger"]) {
      expect(against(`${state}-content`, `${state}-surface`)).toBeGreaterThanOrEqual(4.5);
      // On the page too, because a state colour is not only used inside its own
      // badge — a plugin drawing a star takes the colour and not the tint.
      expect(against(`${state}-content`, "surface")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["accent", "pending"])("carries the body text on its %s tint", (tint) => {
    // These two offer a tinted background and no colour of their own, so what
    // lands on them is the body text — which was chosen against a plain
    // surface, not against a tint. Held for what is actually drawn rather than
    // for a token that would have to exist: a missing pair is only a fault if
    // something becomes hard to read.
    expect(against("content", `${tint}-surface`)).toBeGreaterThanOrEqual(4.5);
    expect(against("content-secondary", `${tint}-surface`)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps its accent legible on a surface", () => {
    expect(against("accent", "surface")).toBeGreaterThanOrEqual(4.5);
    expect(against("danger", "surface")).toBeGreaterThanOrEqual(4.5);
  });
});
