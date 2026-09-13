/**
 * What the stylesheet promises about a control that has gone quiet.
 *
 * Read from the source, because jsdom computes no cascade and a rendered cell
 * would vouch for any rule at all — the same approach `modal-styles.test.ts`
 * and `contrast.test.ts` take, and for the same reason.
 *
 * A control in a cell drops its frame at rest so a table of three people stops
 * reading as nine boxes. That is a presentation trick with two ways to go
 * wrong, and both are held here: a control that goes quiet and never comes back
 * is a control nobody can find, and a control quieted with the `background`
 * shorthand loses the chevron that says it is a choice — which is how this
 * shipped the first time.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Comments out, because a comment holds no braces and a selector list spans
// lines: left in, the prose above a rule is read as part of its selector.
const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/**
 * Every rule body this selector is named in, in the order they are declared.
 *
 * More than one, because these selectors are written twice: once by the rule
 * that gave every native control the panel's frame, and again by the rule that
 * takes it back inside a cell. Reading only the first says the frame is still
 * there, which is the answer the cascade does not give — at equal specificity
 * the last declaration is the one that wins.
 */
function rulesFor(selector: string): readonly string[] {
  return allRules()
    .filter(([named]) => named.includes(selector))
    .map(([, body]) => body);
}

/** Every rule in the stylesheet, as the selectors it names and what it declares. */
function allRules(): readonly (readonly [readonly string[], string])[] {
  return [...STYLES.matchAll(/(^|\n)([^{}@\n][^{}]*?)\{([^{}]*)\}/g)].map(
    (rule) =>
      [(rule[2] ?? "").split(",").map((one) => one.trim()), rule[3] ?? ""] as const,
  );
}

/** What a property ends up as once every rule naming this selector has had its say. */
function settled(selector: string, property: string): string | undefined {
  let value: string | undefined;
  for (const body of rulesFor(selector)) {
    const found = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, "m").exec(body);
    if (found?.[1] !== undefined) value = found[1].trim();
  }
  return value;
}

/** The controls a cell draws, each of which goes quiet at rest. */
const QUIET = [
  ".perch-table__cell .perch-cell__line",
  ".perch-table__cell .perch-cell__choice",
  ".perch-table__cell select",
] as const;

describe("a control that has gone quiet in a cell", () => {
  it.each(QUIET)("%s drops its frame at rest", (selector) => {
    expect(rulesFor(selector).length, `no rule names ${selector}`).toBeGreaterThan(0);
    expect(settled(selector, "border-color")).toBe("transparent");
    expect(settled(selector, "background-color")).toBe("transparent");
  });

  it("takes its frame back under a pointer, from the rule that outranks it", () => {
    // A cell cannot restate this. `.perch-control:hover` carries two `:not()`
    // clauses and beats any selector a cell could write, so the hover a reader
    // gets is the panel's own — and a rule written here would read as the one
    // doing the work while never being reached.
    const shared =
      '.perch-control:hover:not([data-disabled="true"]):not([data-readonly="true"])';

    expect(settled(shared, "border-color"), "no shared hover to inherit").toMatch(
      /^var\(--perch-border/,
    );
    for (const selector of QUIET) {
      // A cell may name no hover of its own: `.perch-control:hover` outranks the
      // two class selectors, and the native select already takes its frame from
      // the rule that gave every browser control one look.
      expect(
        rulesFor(`${selector}:hover`).filter((body) => body.includes("border-color")),
        `${selector}:hover restates a frame it cannot win`,
      ).toHaveLength(selector === ".perch-table__cell select" ? 1 : 0);
    }
  });

  it("marks where the reader already is, not merely where they could go", () => {
    // Hover is an offer and focus is a position, so focus keeps the full frame
    // the rest of the panel uses. Restated in the stylesheet rather than
    // inherited, because the quieting rule carries the same specificity as the
    // shared one and wins on order.
    for (const selector of [
      ".perch-table__cell .perch-cell__line",
      ".perch-table__cell .perch-cell__choice",
    ]) {
      expect(
        settled(`${selector}:focus-within`, "box-shadow"),
        `${selector} has no focus of its own`,
      ).toBe("var(--perch-focus-ring)");
    }
  });

  it("never reaches for the background shorthand where a chevron is drawn", () => {
    // `background:` also resets `background-image`, which is where a select
    // keeps the arrow saying it is a choice. This shipped twice: once in the
    // rule that quiets a cell, and once in `.perch-control:hover`, which erased
    // the chevron at the exact moment a reader pointed at it.
    //
    // Held over every rule that can reach a control, not only the ones in a
    // cell, because the second one was three hundred lines away from the first.
    const offenders = allRules()
      .filter(([named]) =>
        // The control itself and any state of it, plus every rule that styles a
        // browser select — but not `.perch-control__affix` and its like, which
        // are sub-elements that never carry an image.
        named.some(
          (one) => /^\.perch-control(?![\w-])/.test(one) || /\bselect$/.test(one),
        ),
      )
      .filter(([, body]) => /(?:^|;)\s*background:/m.test(body))
      .map(([named]) => named.join(", "));

    expect(offenders).toEqual([]);
  });

  it("leaves the chevron room to stand in", () => {
    // Quieting a cell sets one padding for both sides, and on a select the
    // right side is where the arrow is drawn — set to the same value, the text
    // runs underneath it. Held as a comparison rather than a figure: what
    // matters is that the arrow's side asks for more.
    for (const selector of [
      ".perch-table__cell .perch-cell__choice",
      ".perch-table__cell select",
    ]) {
      const right = settled(selector, "padding-right");
      const both = settled(selector, "padding-inline");

      expect(right, `${selector} reserves nothing for its chevron`).toBeDefined();
      expect(right).not.toBe(both);
    }
  });

  it("leaves a choice in a cell still saying that it is one", () => {
    // With the frame gone at rest, the chevron is all that separates a select
    // from the plain text in the cell beside it. It used to be a data URI in
    // this stylesheet; it is a shape the component draws now, so this reads the
    // component — and refuses the stylesheet a second drawing of it.
    const drawn = readFileSync(new URL("./columns.tsx", import.meta.url), "utf8");

    expect(drawn, "a cell's select has lost its chevron").toContain("<ChevronDown />");
    expect(drawn).toContain('className="perch-picker"');
    for (const body of rulesFor(".perch-table__cell select")) {
      expect(body, "the stylesheet draws the chevron a second time").not.toContain(
        "background-image",
      );
    }
  });
});

describe("the mark on a browser's own select", () => {
  it("is measured from the thing that was moved", () => {
    // The wrapper is what the mark is positioned against, so the wrapper is
    // what the cell's pull has to move. Pulling the control alone left the
    // chevron a padding inside the edge it is supposed to sit against — and no
    // test could see it, because jsdom computes no layout.
    expect(settled(".perch-table__cell .perch-picker", "margin-inline")).toBeDefined();
    expect(
      settled(".perch-table__cell .perch-cell__choice", "margin-inline"),
      "the control is pulled out from under its own mark",
    ).toBeUndefined();
  });

  it("is the same colour as the one a styled select draws", () => {
    // One shape at one weight in one colour, whether the browser drew the
    // control or the panel did — which is the whole reason for drawing it here
    // rather than twice.
    //
    // Letting it inherit was tried and measured wrong: a mark inherits from its
    // wrapper rather than from the control beside it, so it came out the colour
    // of the value in a filter and the colour of a label under the table. The
    // token is named on both, and this holds them together.
    const styled = settled(".perch-select__chevron", "color");

    expect(styled, "the styled chevron has no colour to match").toBeDefined();
    expect(settled(".perch-picker > svg", "color")).toBe(styled);
  });
});
