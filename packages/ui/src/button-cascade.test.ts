/**
 * @vitest-environment jsdom
 *
 * What a button actually resolves to, asked of a real cascade.
 *
 * A modifier that loses to the base class is a modifier that does nothing, and
 * nothing else in this suite can see it: rendering markup produces the same DOM
 * whether a rule wins, loses, or was never written. That is how a second
 * `.perch-button` block sat below the first for several releases, repainting
 * every button in the panel — primary, icon and danger alike — with every test
 * passing throughout, and passing again when it was removed.
 *
 * The obvious way to check this is to read the stylesheet and work out which
 * rule wins. Three attempts at that were wrong in three different ways: one
 * skipped attribute selectors, one counted no specificity at all, one swallowed
 * a comment as part of a selector. Each was convincing enough to put a false
 * claim in a commit message. jsdom implements the cascade, so it is asked
 * instead.
 *
 * `var()` is not resolved here — jsdom carries the reference through, and the
 * token it names is `tokens-defined.test.ts`'s subject. That the right *rule*
 * won is what this file is for.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// From the workspace root, not from `import.meta.url`: under jsdom that is not
// a file URL, and `readFileSync` refuses it.
const STYLES = readFileSync(resolve("packages/ui/src/styles.css"), "utf8");

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
});

/** The declarations a button with those classes ends up with. */
function resolved(
  classes: readonly string[],
  disabled = false,
): { background: string; color: string } {
  const button = document.createElement("button");
  button.className = classes.join(" ");
  button.disabled = disabled;
  document.body.append(button);

  const computed = globalThis.getComputedStyle(button);
  return { background: computed.background, color: computed.color };
}

const PLAIN = ["perch-button"];
const PRIMARY = ["perch-button", "perch-button--primary"];
const ICON = ["perch-button", "perch-button--icon"];
const DANGER = ["perch-button", "perch-button--danger"];

describe("a button at rest", () => {
  it("is neutral, and its own colour", () => {
    expect(resolved(PLAIN)).toEqual({
      background: "var(--perch-surface)",
      color: "var(--perch-content)",
    });
  });

  it("takes the accent only when it asks for it", () => {
    expect(resolved(PRIMARY).background).toBe("var(--perch-accent)");
    expect(resolved(PRIMARY).color).toBe("var(--perch-content-inverse)");
  });

  it("lets an icon button be quiet", () => {
    expect(resolved(ICON).color).toBe("var(--perch-content-muted)");
  });

  it("lets a danger button be red", () => {
    expect(resolved(DANGER).color).toBe("var(--perch-danger)");
  });
});

describe("a disabled button", () => {
  /**
   * Whatever its modifier asks for. `.perch-button:disabled` is a class plus a
   * pseudo-class and a modifier is one class, so specificity settles it before
   * source order is consulted — which two commit messages got backwards, having
   * reasoned from position alone.
   */
  it.each([
    ["a plain button", PLAIN],
    ["a primary button", PRIMARY],
    ["an icon button", ICON],
    ["a danger button", DANGER],
  ])("mutes %s", (_what, classes) => {
    expect(resolved(classes, true)).toEqual({
      background: "var(--perch-surface-muted)",
      color: "var(--perch-content-muted)",
    });
  });
});

describe("the search form", () => {
  it("gives its field and its button the same height", () => {
    // A field is taller than a button everywhere else, because a button is not
    // a field. In one row they have to agree, and nothing that renders markup
    // can see that they do not.
    const form = document.createElement("form");
    form.className = "perch-list__search";
    const field = document.createElement("input");
    field.className = "perch-control";
    const button = document.createElement("button");
    button.className = "perch-button";
    form.append(field, button);
    document.body.append(form);

    expect(globalThis.getComputedStyle(field).height).toBe(
      globalThis.getComputedStyle(button).height,
    );
  });
});
