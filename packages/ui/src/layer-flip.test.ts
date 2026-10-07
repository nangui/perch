/**
 * @vitest-environment jsdom
 *
 * The hand-written sheet wins where specificity would have given it away.
 *
 * `sheets.test.ts` catches the blunt version of this: a class styled directly
 * by both sheets, where the moved rule renders from the old one. It skips any
 * selector carrying a combinator on purpose, because a combinator usually means
 * a deliberate override — `.perch-table__cell .perch-control` sets a cell's
 * control apart, and the cascade is what that is for.
 *
 * This is the case that slips between the two. A filter renders
 * `<select class="perch-control">` inside `.perch-list__search`, and the sheet
 * still written by hand frames every bare native control the panel draws —
 * `.perch-list__search select`, one class and one element. Against
 * `.perch-list__search .perch-control`, two classes, it lost, which is what the
 * `:not(.perch-control)` on the `input` arm beside it was written for. Once the
 * list surface moved into a layer it won instead, and a select filter grew from
 * the bar's small height to the full one while every assertion stayed green.
 *
 * So the test is not "do both sheets touch this element" — they do, constantly,
 * and legitimately. It is: *would specificity have decided it the other way?*
 * Where the generated selector is as specific or more, the layer flipped the
 * outcome and the hand-written rule is a rule written to lose, left behind.
 *
 * It reads elements rather than selectors, because `select` matching
 * `.perch-control` is a fact about the markup and not one any pair of selectors
 * reveals.
 *
 * What it does not see is a state. An element here is never hovered, so the
 * `:hover` arm of that same rule — which overrode the control's own hover and
 * took a disabled one's suppression with it — was found by reading the sheet
 * and not by this. Reproducing a state means driving the element, which is a
 * different test from one that reads two files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// From the workspace root, not from `import.meta.url`: under jsdom that is not
// a file URL, and the read comes back with something other than the sheet
// without failing — this test read its own source that way and reported
// nothing wrong.
const read = (name: string): string =>
  readFileSync(resolve(`packages/ui/src/${name}`), "utf8");

/**
 * Shapes the panel actually renders, with the container they render inside.
 *
 * A roster rather than a sweep: there is no corpus of rendered markup to read,
 * and a fixture built from the real components needs a resolved tree per page.
 * Each line is a shape somebody checked, so a shape nobody has checked is
 * visibly absent instead of silently covered.
 */
const SHAPES: readonly { readonly what: string; readonly html: string }[] = [
  {
    what: "a select filter in the search bar",
    html: `<form class="perch-list__search"><select class="perch-control"></select></form>`,
  },
  {
    what: "a disabled select filter in the search bar",
    html:
      `<form class="perch-list__search">` +
      `<select class="perch-control" data-disabled="true"></select></form>`,
  },
  {
    what: "a text filter in the search bar",
    html: `<form class="perch-list__search"><input class="perch-control" /></form>`,
  },
  {
    what: "the page-size select",
    html: `<label class="perch-list__size"><select></select></label>`,
  },
  {
    what: "a picker in a table cell",
    html: `<td class="perch-table__cell"><select></select></td>`,
  },
  {
    what: "a control in a table cell",
    html: `<td class="perch-table__cell"><input class="perch-control" /></td>`,
  },
  {
    what: "a field's control on a form page",
    html: `<div class="perch-field"><input class="perch-control" /></div>`,
  },
];

/** A rule, flattened out of whatever layers and at-rules wrapped it. */
type Rule = { readonly selector: string; readonly properties: ReadonlySet<string> };

/**
 * Top-level rules only, layers unwrapped.
 *
 * An at-rule that is not a layer — a media query, a `@supports` — is skipped
 * rather than flattened: its rules apply under a condition this test does not
 * reproduce, and hoisting them out would compare two rules that never both
 * apply.
 */
function rules(css: string): readonly Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (text: string): void => {
    let at = 0;
    while (at < text.length) {
      const open = text.indexOf("{", at);
      if (open === -1) return;
      let depth = 1;
      let end = open + 1;
      while (end < text.length && depth > 0) {
        if (text[end] === "{") depth += 1;
        else if (text[end] === "}") depth -= 1;
        end += 1;
      }
      const head = text.slice(at, open).trim().replace(/\s+/g, " ");
      const body = text.slice(open + 1, end - 1);
      if (head.startsWith("@layer")) walk(body);
      else if (!head.startsWith("@")) {
        const properties = new Set<string>();
        for (const one of body.split(";")) {
          const colon = one.indexOf(":");
          if (colon === -1 || one.includes("{")) continue;
          const property = one.slice(0, colon).trim();
          if (property !== "" && !property.startsWith("--")) properties.add(property);
        }
        if (properties.size > 0) {
          for (const selector of head
            .split(",")
            .map((one) => one.trim())
            .filter(Boolean)) {
            out.push({ selector, properties });
          }
        }
      }
      at = end;
    }
  };
  walk(clean);
  return out;
}

/**
 * How much a selector carries, as the cascade counts it.
 *
 * Ids, then classes with attributes and pseudo-classes, then elements. `:not()`
 * and `:is()` contribute what is inside them; `:where()` contributes nothing,
 * which is the whole reason a floor is written with it.
 */
function weight(selector: string): readonly [number, number, number] {
  let rest = selector;
  let a = 0;
  let b = 0;
  let c = 0;
  // Inner lists first, so their own contents are counted before the pseudo-class
  // that wraps them is stripped as plain text.
  for (;;) {
    const found = /:(not|is|where|has)\(([^()]*)\)/.exec(rest);
    if (found === null) break;
    if (found[1] !== "where") {
      for (const inner of (found[2] ?? "").split(",")) {
        const [x, y, z] = weight(inner.trim());
        a += x;
        b += y;
        c += z;
      }
    }
    rest = rest.replace(found[0], " ");
  }
  a += (rest.match(/#[\w-]+/g) ?? []).length;
  rest = rest.replace(/#[\w-]+/g, " ");
  b += (rest.match(/\.[\w-]+/g) ?? []).length;
  rest = rest.replace(/\.[\w-]+/g, " ");
  b += (rest.match(/\[[^\]]*\]/g) ?? []).length;
  rest = rest.replace(/\[[^\]]*\]/g, " ");
  c += (rest.match(/::[\w-]+/g) ?? []).length;
  rest = rest.replace(/::[\w-]+/g, " ");
  b += (rest.match(/:[\w-]+/g) ?? []).length;
  rest = rest.replace(/:[\w-]+/g, " ");
  c += (rest.match(/\b[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}

const atLeast = (one: readonly number[], other: readonly number[]): boolean => {
  for (let at = 0; at < 3; at += 1) {
    if ((one[at] ?? 0) !== (other[at] ?? 0)) return (one[at] ?? 0) > (other[at] ?? 0);
  }
  return true;
};

describe("a surface that moved into a layer", () => {
  const generated = rules(read("panda.css"));
  const byHand = rules(read("styles.css"));

  it("is not overruled by a hand-written rule that specificity used to beat", () => {
    const flipped: string[] = [];

    for (const shape of SHAPES) {
      const host = document.createElement("div");
      host.innerHTML = shape.html;
      for (const element of host.querySelectorAll("*")) {
        const matching = (set: readonly Rule[]): readonly Rule[] =>
          set.filter((rule) => {
            try {
              return element.matches(rule.selector);
            } catch {
              // A selector jsdom cannot parse cannot be reasoned about either.
              return false;
            }
          });
        const mine = matching(byHand);
        const theirs = matching(generated);
        if (mine.length === 0 || theirs.length === 0) continue;

        for (const old of mine) {
          for (const property of old.properties) {
            const beaten = theirs.find(
              (rule) =>
                rule.properties.has(property) &&
                atLeast(weight(rule.selector), weight(old.selector)),
            );
            if (beaten === undefined) continue;
            flipped.push(
              `${shape.what}: \`${old.selector}\` sets ${property} and now wins ` +
                `over \`${beaten.selector}\`, which specificity gave it to`,
            );
          }
        }
      }
    }

    expect([...new Set(flipped)].sort()).toEqual([]);
  });

  it("was comparing something, so it cannot pass by matching nothing", () => {
    expect(generated.length).toBeGreaterThan(100);
    expect(byHand.length).toBeGreaterThan(100);
    // And the roster reaches the generated sheet at all: a selector typo in
    // every shape would otherwise read as nothing to report.
    const reached = SHAPES.some((shape) => {
      const host = document.createElement("div");
      host.innerHTML = shape.html;
      return [...host.querySelectorAll("*")].some((element) =>
        generated.some((rule) => {
          try {
            return element.matches(rule.selector);
          } catch {
            return false;
          }
        }),
      );
    });
    expect(reached).toBe(true);
  });
});
