/**
 * The one endpoint of this demo that puts something from the address into a
 * document.
 *
 * It is a public deployment serving SVG from its own origin, so the name in the
 * path reaches markup that a browser will parse. What keeps that safe is two
 * lines doing it together: only the first character of each of the first two
 * words survives, and then anything outside `A-Z0-9` is dropped. Either alone
 * would be enough to make somebody simplifying this think the other is
 * redundant.
 */
import { describe, expect, it } from "vitest";
import { ImagesController } from "./images.controller.js";

const drawn = (name: string): string => new ImagesController().draw(name);

/** What ends up between the text tags, which is the only part not written here. */
const inked = (name: string): string =>
  /dominant-baseline="central">([^<]*)</.exec(drawn(name))?.[1] ?? "MISSING";

describe("what it draws", () => {
  it("takes one letter from each of the first two words", () => {
    expect(inked("ada-lovelace.svg")).toBe("AL");
    expect(inked("Grace Hopper")).toBe("GH");
  });

  it("keeps a row's colour between restarts", () => {
    // Deterministic on purpose: a hue drawn from a counter or a clock gives a
    // table that changes colour when the process does.
    expect(drawn("ada-lovelace.svg")).toBe(drawn("ada-lovelace.svg"));
    expect(drawn("ada")).not.toBe(drawn("grace"));
  });

  it("holds nothing but letters and digits, whatever arrived", () => {
    for (const hostile of [
      "<script>alert(1)</script>",
      '"><script>x</script>',
      "</text><script>x</script>",
      "&lt;b&gt;",
      "../../etc/passwd",
      "' onload='x",
    ]) {
      expect(inked(hostile), `from ${hostile}`).toMatch(/^[A-Z0-9]{0,2}$/);
    }
  });

  it("opens no tag of its own beyond the five it writes", () => {
    // Counted rather than matched: the document is built by hand, so what is
    // asserted is that nothing arriving added to it.
    const tags = (name: string): number => (drawn(name).match(/</g) ?? []).length;

    expect(tags("<script>alert(1)</script>")).toBe(tags("ada"));
  });

  it("still answers a document when the name has no letters at all", () => {
    const drawing = drawn("123-456");

    expect(drawing).toContain("<svg");
    expect(drawing).toContain("</svg>");
    expect(inked("123-456")).toBe("14");
  });
});
