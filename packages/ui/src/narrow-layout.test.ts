/**
 * What the stylesheet promises a narrow window.
 *
 * Read from the source, because jsdom computes no layout: a rendered form
 * measures zero there and would vouch for any rule at all. The same approach
 * `modal-styles.test.ts` takes, and for the same reason.
 *
 * A `columns(3)` honoured on a phone is three fields of eleven characters and a
 * date picker that cannot show a date. Below the width two fields are worth
 * reading side by side, the declaration stops being an instruction, and the
 * layout has to say so — a grid that keeps its columns there is a form nobody
 * can fill in.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Both sheets, the generated one first, as the panel serves them.
const STYLES = [
  readFileSync(new URL("./panda.css", import.meta.url), "utf8"),
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
].join("\n");

/** The body of the at-rule opening with this condition, counting from `from`. */
function blockOf(condition: string, from = 0): string {
  const at = STYLES.indexOf(`@media ${condition}`, from);
  expect(at, `no rule for ${condition}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let cursor = STYLES.indexOf("{", at); cursor < STYLES.length; cursor += 1) {
    if (STYLES[cursor] === "{") depth += 1;
    if (STYLES[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return STYLES.slice(at, cursor + 1);
    }
  }
  return "";
}

/**
 * The block at this width that names this selector, wherever it sits.
 *
 * Found by what it holds rather than by being the first or the second. There
 * are several blocks at this width now — the dashboard's grid collapses here
 * too — so counting them picks whichever surface happens to be written first.
 * Position still matters for the shell, and the test below holds it directly
 * instead of leaving it implied by a lookup.
 */
function narrowBlockNaming(selector: string): string {
  const condition = "(max-width: 40rem)";
  for (let from = 0; ;) {
    const at = STYLES.indexOf(`@media ${condition}`, from);
    if (at === -1) break;
    const block = blockOf(condition, at);
    if (block.includes(selector)) return block;
    from = at + block.length;
  }
  expect.fail(`no block at ${condition} names ${selector}`);
}

describe("a form in a narrow window", () => {
  const narrow = (): string => narrowBlockNaming(".perch-layout__body");

  it("stacks what a declaration asked to put side by side", () => {
    expect(narrow()).toContain(".perch-layout__body");
    expect(narrow()).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("closes the gap the columns had needed", () => {
    // The space that separated two columns reads as a space between unrelated
    // things once everything is one column.
    // Either spelling of the step: a hand-written rule names the property a
    // theme overrides, a generated one reaches it through the alias the styling
    // engine names after its category.
    expect(narrow()).toMatch(/gap:\s*var\(--perch-(?:space|spacing)-\d\)/);
  });

  it("is keyed to the width and not to the device", () => {
    // A narrow window on a desktop has the same problem, and a rule keyed to a
    // touch screen would miss it.
    expect(narrow()).not.toContain("pointer:");
    expect(narrow()).not.toContain("hover:");
  });
});

/**
 * The navigation, which is what actually made the difference.
 *
 * It holds a fixed fifteen rems. Measured at 390px before this: the page had
 * 374, the form's own area 134, and a field 22 — the grid above was collapsing
 * into a space that was already too small.
 */
describe("the shell in a narrow window", () => {
  // After the rules it undoes, because at equal specificity the last one wins.
  // Placed beside the grid's rules it lost to `display: flex` and measured as
  // no change at all. Which block that is no longer depends on where anybody
  // wrote it: both halves are generated, so it is found by what it names.
  const shell = (): string => narrowBlockNaming(".perch-shell");

  it("stacks the navigation above the page rather than beside it", () => {
    expect(shell()).toContain(".perch-shell");
    expect(shell()).toContain("display: block");
  });

  it("reaches the window's edge, with no margin left on the body", () => {
    // The shell puts the root class on `<body>`, which a browser gives eight
    // pixels of margin.
    const root = /\.perch-root\s*\{([^}]*)\}/.exec(STYLES)?.[1];

    expect(root).toContain("margin: 0");
  });

  it("stacks the row the navigation and the page share", () => {
    // The topbar moved both into `.perch-shell__body`, and stacking only the
    // shell above it left them side by side on a phone, with nothing failing.
    const body = narrowBlockNaming(".perch-shell__body");
    const rule = /\.perch-shell__body\s*\{([^}]*)\}/.exec(body)?.[1];

    expect(rule).toContain("display: block");
  });

  it("folds the menu behind its button", () => {
    const groups = narrowBlockNaming(".perch-nav__groups");

    expect(/\.perch-nav__groups\s*\{([^}]*)\}/.exec(groups)?.[1]).toContain(
      "display: none",
    );
    expect(
      /\.perch-nav__toggle\s*\{([^}]*)\}/.exec(
        narrowBlockNaming(".perch-nav__toggle"),
      )?.[1],
    ).toContain("display: flex");
  });

  it("lets the navigation take the width instead of a fixed column", () => {
    expect(shell()).toContain("width: auto");
  });

  it("comes after the rule it has to undo, or it does nothing at all", () => {
    // The bug this file exists to keep out: the rule was right, unreachable,
    // and silent about it.
    //
    // Still the right thing to measure — the order in the sheet the panel
    // serves — but no longer for the reason it was written. Both halves are
    // generated now, so where the block lands is the engine's decision rather
    // than a file somebody keeps in order, and `emitted-order.test.ts` is
    // what reads that decision off the sheet. This stays because it is about
    // this layout and names the fault.
    const flex = STYLES.indexOf(".perch-shell {");
    const block = STYLES.indexOf("@media (max-width: 40rem)", flex);

    expect(flex).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(flex);
  });
});

describe("a list's gutter in a narrow window", () => {
  // Measured on a phone: the shell's main and the list both padded the page,
  // and the heading kept the browser's margin, which put the title 50px under
  // the menu bar and every card 34px in from each side.
  it("is the shell's alone, 16px from every edge", () => {
    const main = /\.perch-shell__main\s*\{([^}]*)\}/.exec(
      narrowBlockNaming(".perch-shell__main"),
    )?.[1];
    expect(main).toContain("padding: var(--perch-space-7) var(--perch-space-7)");

    const block = narrowBlockNaming(".perch-list__title");
    expect(/\.perch-list__title\s*\{([^}]*)\}/.exec(block)?.[1]).toContain("margin: 0");
  });
});

describe("a list's place on the page at any width", () => {
  // Measured at 1440px: a list padded itself inside the shell's main, so its
  // title sat 31px lower and its table 24px further in than the dashboard's,
  // and everything jumped on the way from one to the other.
  it("adds no gutter of its own to the shell's", () => {
    const own = [...STYLES.matchAll(/(?:^|\n)\s*\.perch-list\s*\{([^}]*)\}/g)].map(
      (rule) => rule[1] ?? "",
    );
    expect(own.length).toBeGreaterThan(0);
    for (const body of own) expect(body).not.toContain("padding");
  });

  it("starts its title and what follows it where every page's do", () => {
    const page = /\.perch-page__title\s*\{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
    const title = /\.perch-list__title\s*\{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
    const header = /\.perch-list__header\s*\{([^}]*)\}/.exec(STYLES)?.[1] ?? "";

    // A page's title is spaced `space-4` above and `space-8` below; a list's
    // title takes the space above and its header the space below, because
    // the header holds the tools beside the title as well.
    expect(page).toContain("margin: var(--perch-space-4) 0 var(--perch-space-8)");
    expect(title).toContain("margin: var(--perch-space-4) 0 0");
    expect(header).toContain("margin-bottom: var(--perch-spacing-8)");
  });
});

describe("a row's line in a narrow window", () => {
  // Measured on a phone: on a baseline, an avatar's baseline is its bottom
  // edge, and "Name" sat level with the foot of the picture.
  it("centres the label against the value, as a wide row does", () => {
    // Anchored to the start of a line: the footer's rule ends in the same
    // class and comes first in the block.
    const cell = /(?:^|\n)\s*\.perch-table__cell\s*\{([^}]*)\}/.exec(
      narrowBlockNaming(".perch-table__cell"),
    )?.[1];
    expect(cell).toContain("align-items: center");
  });
});

describe("a toast in a narrow window", () => {
  // Measured on a phone: at the top it covered the button that opens the menu.
  it("is said at the foot of the screen, across its width", () => {
    const corner = /\.perch-toasts\s*\{([^}]*)\}/.exec(
      narrowBlockNaming(".perch-toasts"),
    )?.[1];
    expect(corner).toContain("bottom: 0");
    expect(corner).toContain("top: auto");
    expect(corner).toContain("width: 100%");
  });
});

describe("a table's footer in a narrow window", () => {
  // Measured on a phone: every column with no total drew an empty strip of its
  // own, ruled top and bottom, under a footer that kept a table's width.
  const foot = (): string => narrowBlockNaming(".perch-table__foot");

  it("stacks like the rows above it", () => {
    expect(/\.perch-table__foot\s*\{([^}]*)\}/.exec(foot())?.[1]).toContain(
      "display: block",
    );
  });

  it("draws only the columns that have something to say", () => {
    expect(foot()).toMatch(
      /\.perch-table__foot \.perch-table__cell:empty[^{]*\{\s*display: none/,
    );
  });
});

describe("a filter bar's Apply", () => {
  const rule = /\.perch-list__search > button\[type="submit"\]\s*\{([^}]*)\}/;

  it("sits in the next cell rather than on a row of its own", () => {
    // Its own row left a band of empty panel under two boxes, with the button
    // stranded at the far end of it.
    const wide = rule.exec(STYLES)?.[1];
    expect(wide).toBeDefined();
    expect(wide).not.toContain("grid-column");
    expect(wide).toContain("align-self: end");
  });

  it("takes the whole line on a phone, as each filter does", () => {
    expect(rule.exec(narrowBlockNaming(".perch-list__search > button"))?.[1]).toContain(
      "justify-self: stretch",
    );
  });
});

describe("a column that says how much room it takes", () => {
  it("is aligned by a logical property, so it holds right to left", () => {
    // `text-align: right` pins a column of numbers to the wrong end of the row
    // for a reader in Arabic or Hebrew. `end` is the edge the line finishes
    // at, whichever side that is.
    expect(STYLES).toContain("text-align: end");
    expect(STYLES).not.toMatch(/\.perch-table__cell--end\s*\{\s*text-align:\s*right/);
  });

  it("is dropped only below the width where a row stops being a row", () => {
    // The same breakpoint the rest of this file is about. A column hidden at
    // one width and a layout that stacks at another is two answers to one
    // question, and a reader meets whichever is worse.
    const at = STYLES.indexOf("perch-table__cell--wide-only");
    expect(at).toBeGreaterThan(-1);
    expect(STYLES.slice(STYLES.lastIndexOf("@media", at), at)).toContain(
      "(max-width: 40rem)",
    );
  });
});

describe("a list's pager in a narrow window", () => {
  it("takes the line it wraps onto, halved, rather than its start", () => {
    const block = narrowBlockNaming(".perch-pagination");
    expect(/\.perch-pagination\s*\{([^}]*)\}/.exec(block)?.[1]).toContain(
      "flex-basis: 100%",
    );
    expect(/\.perch-pagination > \*\s*\{([^}]*)\}/.exec(block)?.[1]).toContain(
      "flex: 1",
    );
  });
});
