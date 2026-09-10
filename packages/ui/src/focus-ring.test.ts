/**
 * Nothing in the panel loses the mark of where the keyboard is.
 *
 * Twenty-six focusable things had no ring of their own and fell back to the
 * browser's outline — a blue ring in the middle of a panel that has a green
 * one, on a tab, on a calendar's arrow, on the button that adds an option. A
 * list of them is a list somebody forgets, so the stylesheet carries a floor
 * instead, and this holds the floor rather than the list.
 *
 * Read from the source: jsdom computes no cascade, and a rendered control would
 * vouch for any rule at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Every rule, as the selectors it names and what it declares. */
function rules(): readonly (readonly [string, string])[] {
  return [...STYLES.matchAll(/(^|\n)([^{}@\n][^{}]*?)\{([^{}]*)\}/g)].map(
    (rule) => [(rule[2] ?? "").trim(), rule[3] ?? ""] as const,
  );
}

describe("the mark of where the keyboard is", () => {
  it("has a floor that reaches what no rule claimed", () => {
    const floor = rules().find(
      ([named]) => named.includes(":where(") && named.includes(":focus-visible"),
    );

    expect(floor, "nothing catches a control with no ring of its own").toBeDefined();
    expect(floor?.[1]).toContain("box-shadow: var(--perch-focus-ring)");
    // `:where` and nothing else, so a rule wanting a border colour with its ring
    // still wins. A floor that overrode them would be a ceiling.
    expect(floor?.[0].startsWith(":where(")).toBe(true);
  });

  it("reaches a dialog and a popover, which are drawn outside the shell", () => {
    const floor = rules().find(([named]) => named.includes(":focus-visible"));

    // Matched on the class prefix rather than under `.perch-shell`: a portal
    // puts its content against the body, where a descendant selector rooted at
    // the shell would never find it.
    expect(floor?.[0]).toContain('[class^="perch-"]');
    expect(floor?.[0]).not.toContain(".perch-shell ");
  });

  it("never overrides the floor with a shadow of its own", () => {
    // The floor only reaches what nothing else claimed. A rule that quiets the
    // browser's outline and puts some other `box-shadow` in its place claims
    // the property and loses the mark — which a rule quieting the outline and
    // saying nothing about shadows does not, since the floor still draws it.
    const claimed = rules()
      .filter(([named]) => named.includes(":focus"))
      .filter(([, body]) => /(?:^|;)\s*box-shadow:/m.test(body))
      .filter(([, body]) => !body.includes("--perch-focus-ring"))
      .map(([named]) => named);

    expect(claimed).toEqual([]);
  });
});
