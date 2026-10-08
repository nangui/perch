/**
 * @vitest-environment jsdom
 *
 * A hand-written rule winning where specificity would have given it away.
 *
 * Unlayered beats every layer, so a surface still written by hand can overrule
 * a moved one whatever it carries. The question here is not whether both sheets
 * touch an element — they do, legitimately — but whether the layer reversed the
 * outcome: where the generated selector is strictly more specific, the rule left
 * behind was written to lose.
 *
 * It reads elements, not selectors. A select filter renders
 * `<select class="perch-control">`, so `.perch-list__search select` and
 * `.perch-list__search .perch-control` meet on one element, which no pair of
 * selectors shows. States are taken off both sides before matching, since jsdom
 * hovers nothing; specificity is still counted on what is written.
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
 * Shapes the panel renders, with the container they render inside.
 *
 * A roster rather than a sweep, so a shape nobody has checked is visibly
 * absent instead of silently covered.
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
  {
    // Both classes on one element: the cell quiets the frame the control draws.
    what: "an editable cell's quiet line",
    html:
      `<td class="perch-table__cell">` +
      `<input class="perch-control perch-cell__line" /></td>`,
  },
  {
    what: "an editable cell's quiet select",
    html:
      `<td class="perch-table__cell"><span class="perch-picker">` +
      `<select class="perch-control perch-cell__choice"></select></span></td>`,
  },
  {
    what: "a pending edit in a cell",
    html:
      `<td class="perch-table__cell">` +
      `<input class="perch-control perch-cell__line" data-pending="true" /></td>`,
  },
  {
    what: "the pick column's checkbox",
    html:
      `<td class="perch-table__cell perch-table__pick"><span class="perch-checkbox">` +
      `<input type="checkbox" class="perch-checkbox__input" />` +
      `<span class="perch-checkbox__box"></span></span></td>`,
  },
  {
    what: "a column heading",
    html:
      `<table class="perch-table"><thead><tr>` +
      `<th class="perch-table__head"></th></tr></thead></table>`,
  },
  {
    what: "a row and its cell",
    html:
      `<table class="perch-table"><tbody><tr>` +
      `<td class="perch-table__cell"></td></tr></tbody></table>`,
  },
  {
    what: "a switch field",
    html:
      `<div class="perch-toggle-row" data-disabled="false">` +
      `<button class="perch-toggle" data-state="checked">` +
      `<span class="perch-toggle__knob"><i class="perch-toggle__icon"></i></span></button>` +
      `<div class="perch-toggle-text"><label class="perch-toggle-text__label"></label>` +
      `<p class="perch-toggle-text__help" data-error="true"></p></div></div>`,
  },
  {
    what: "a locked switch field",
    html:
      `<div class="perch-toggle-row" data-disabled="true">` +
      `<button class="perch-toggle" disabled data-state="checked">` +
      `<span class="perch-toggle__knob"></span></button>` +
      `<div class="perch-toggle-text">` +
      `<label class="perch-toggle-text__label"></label></div></div>`,
  },
  {
    what: "a choice group wearing buttons",
    html:
      `<div role="radiogroup" class="perch-toggles" data-grouped="true">` +
      `<div class="perch-toggles__option">` +
      `<input type="radio" class="perch-toggles__input" checked />` +
      `<label class="perch-toggles__label"></label></div></div>`,
  },
  {
    what: "a choice group wearing dots",
    html:
      `<div role="radiogroup" class="perch-radio" data-inline="true">` +
      `<div class="perch-radio__option">` +
      `<input type="radio" class="perch-radio__input" checked />` +
      `<span class="perch-radio__dot"></span>` +
      `<label class="perch-radio__label"></label></div></div>`,
  },
  {
    what: "a locked dot",
    html:
      `<div class="perch-radio"><div class="perch-radio__option">` +
      `<input type="radio" class="perch-radio__input" disabled />` +
      `<span class="perch-radio__dot"></span>` +
      `<label class="perch-radio__label"></label></div></div>`,
  },
  {
    what: "a textarea with its footer",
    html:
      `<div class="perch-textarea" data-state="draft">` +
      `<textarea class="perch-textarea__input" data-autosize="true"></textarea>` +
      `<div class="perch-textarea__footer">` +
      `<span class="perch-textarea__status"></span>` +
      `<span class="perch-textarea__count"></span></div></div>`,
  },
  {
    what: "a read-only textarea",
    html:
      `<div class="perch-textarea" data-readonly="true">` +
      `<textarea class="perch-textarea__input"></textarea></div>`,
  },
  {
    what: "a field on a form page",
    html:
      `<div class="perch-field"><div class="perch-field__label-row">` +
      `<label class="perch-field__label"></label></div>` +
      `<div class="perch-field__row"><input class="perch-control" /></div>` +
      `<p class="perch-field__help" data-error="true"></p></div>`,
  },
  {
    // The view page closes the reserved line where it holds nothing, which is
    // the one rule about a field written outside the surface.
    what: "a field on a view page",
    html:
      `<div class="perch-view"><div class="perch-field">` +
      `<p class="perch-field__help"></p></div></div>`,
  },
  {
    // The option row is the select's surface and stays hand-written, so this
    // shape is the seam: a layered list holding an unlayered row.
    what: "a searchable select's list",
    html:
      `<div class="perch-combobox__list"><li class="perch-option" data-highlighted>` +
      `<span class="perch-option__meta"></span>` +
      `<span class="perch-option__check"></span></li></div>`,
  },
  {
    what: "a relation combobox",
    html:
      `<div class="perch-combobox"><div class="perch-combobox__search">` +
      `<span class="perch-combobox__glass"></span>` +
      `<input class="perch-combobox__search-input" />` +
      `<span class="perch-combobox__count"></span></div>` +
      `<div class="perch-combobox__result" data-selected="true">` +
      `<span class="perch-combobox__avatar"></span></div></div>`,
  },
  {
    // Ark writes its state attributes without values, so the shape carries
    // them that way rather than as `="true"`: a rule keyed on a value would
    // match nothing here and would match nothing in a browser either.
    what: "a date grid",
    html:
      `<div class="perch-calendar"><div class="perch-calendar__head">` +
      `<div class="perch-calendar__nav">` +
      `<button class="perch-calendar__nav-button"></button></div></div>` +
      `<table class="perch-calendar__table"><thead><tr>` +
      `<th class="perch-calendar__weekday"></th></tr></thead><tbody><tr>` +
      `<td class="perch-calendar__cell" data-value="2026-10-07">` +
      `<div class="perch-calendar__day" data-selected></div>` +
      `</td></tr></tbody></table></div>`,
  },
  {
    // The control tints this on focus, from a rule of its own. Both have to
    // sit in the same origin for three classes to beat one.
    what: "a select's chevron inside a control",
    html: `<div class="perch-control"><span class="perch-select__chevron"></span></div>`,
  },
  {
    what: "an option row in a list",
    html:
      `<li class="perch-option" data-highlighted aria-selected="true">` +
      `<span class="perch-option__meta"></span>` +
      `<span class="perch-option__check"></span></li>`,
  },
  {
    // Second in the row, which is where the shell puts it: the control is first
    // and takes `> :first-child`. Written the other way round, this reported a
    // flip that only its own markup had.
    what: "the button that makes a missing row",
    html:
      `<div class="perch-field__row"><div class="perch-control"></div>` +
      `<button class="perch-select-create"></button></div>`,
  },
  {
    // Both classes on one element, which is how the shell draws a reader who
    // has no menu to open: the pair rule dresses it and the modifier takes its
    // cursor back.
    what: "a user with nothing to open",
    html:
      `<div class="perch-user perch-user--plain"><span class="perch-user__who">` +
      `<span class="perch-user__name"></span>` +
      `<span class="perch-user__description"></span></span></div>`,
  },
  {
    what: "the user menu",
    html:
      `<details class="perch-user"><summary class="perch-user__button">` +
      `<span class="perch-user__mark"></span></summary>` +
      `<ul class="perch-user__panel"><li>` +
      `<a class="perch-user__link"><span class="perch-user__icon"></span></a>` +
      `</li></ul></details>`,
  },
  {
    what: "the code editor",
    html:
      `<div class="perch-code" data-readonly="true"><div class="perch-code__bar">` +
      `<span class="perch-code__status"></span>` +
      `<span class="perch-code__diagnostic"></span></div>` +
      `<div class="perch-code__line" data-error="true">` +
      `<div class="perch-code__gutter"></div>` +
      `<div class="perch-code__text"></div></div></div>`,
  },
  {
    // The picker and the control share an element, and both declare `gap`, so
    // which applies rests on the picker being declared second.
    what: "a colour picker",
    html:
      `<div class="perch-control perch-color"><span class="perch-color__well">` +
      `<input class="perch-color__swatch" /></span>` +
      `<input class="perch-control__input perch-color__text" /></div>`,
  },
  {
    // Its input is the browser's own, visible and unstyled, which is why it is
    // not among the ones drawing their focus on a sibling.
    what: "a list of checkboxes",
    html:
      `<div class="perch-checkbox-list"><label class="perch-checkbox-list__all">` +
      `</label><div class="perch-checkbox-list__options">` +
      `<div class="perch-checkbox-list__option">` +
      `<input type="checkbox" class="perch-checkbox-list__input" disabled />` +
      `<label class="perch-checkbox-list__label"></label></div></div></div>`,
  },
  {
    what: "a list of checkboxes with nothing to choose",
    html:
      `<div class="perch-checkbox-list perch-checkbox-list--empty">` +
      `<span class="perch-checkbox-list__empty"></span></div>`,
  },
  {
    what: "the shell, stacked or not",
    html:
      `<div class="perch-shell"><div class="perch-shell__body">` +
      `<nav class="perch-nav"><div class="perch-nav__group">` +
      `<p class="perch-nav__heading"></p><ul class="perch-nav__list"><li>` +
      `<a class="perch-nav__link" aria-current="page">` +
      `<span class="perch-nav__badge"></span></a></li></ul></div></nav>` +
      `<main class="perch-shell__main"></main></div></div>`,
  },
  {
    what: "a breadcrumb under the shell's main",
    html: `<main class="perch-shell__main"><nav class="perch-breadcrumb"></nav></main>`,
  },
  {
    what: "an action in a cell",
    html:
      `<td class="perch-table__cell perch-table__actions">` +
      `<button class="perch-table__action"></button></td>`,
  },
];

/**
 * The states a selector can ask for that no static DOM is in. A pair asking for
 * two different ones is still compared: an element can be hovered and focused.
 *
 * Longest first, and that is the whole correctness of it. Written with `focus`
 * ahead of `focus-within`, the alternation took `:focus` and left `-within`
 * glued to the class before it, so every selector carrying either long form
 * matched nothing and no focus state was ever compared.
 */
const STATES =
  /:(focus-visible|focus-within|placeholder-shown|user-invalid|indeterminate|hover|focus|active|visited|target|checked)\b/g;

const stateless = (selector: string): string => selector.replace(STATES, "");

/**
 * A `<td>` assigned to a `div` is dropped on the floor — no table context — so
 * every shape starting at a cell became an empty host with nothing to compare.
 */
function built(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = /^\s*<(td|th|tr|tbody|thead)\b/.test(html)
    ? `<table><tbody><tr>${html}</tr></tbody></table>`
    : html;
  return host;
}

/**
 * A selector list, split at its own commas. Not `split(",")`:
 * `:where([class^="perch-"], [class*=" perch-"])` carries one, and the halves
 * it produced matched everything.
 */
function listed(head: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let one = "";
  for (const character of head) {
    if (quote !== "") {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      out.push(one.trim());
      one = "";
      continue;
    }
    one += character;
  }
  out.push(one.trim());
  return out.filter((selector) => selector !== "");
}

/** A rule, flattened out of whatever layers and at-rules wrapped it. */
type Rule = { readonly selector: string; readonly properties: ReadonlySet<string> };

/**
 * Top-level rules only, layers unwrapped. A media query or `@supports` is
 * skipped rather than hoisted: its rules apply under a condition this test does
 * not reproduce.
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
          for (const selector of listed(head)) {
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
 * How much a selector carries, as the cascade counts it. `:not()` and `:is()`
 * contribute what is inside them; `:where()` contributes nothing.
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

/**
 * Strictly more, and strictly is the point. Nothing here reads `!important`,
 * which beats a normal declaration whatever either carries — the panel has two,
 * both on properties nothing else claims. At equal specificity the
 * hand-written rule wins, which is what won before the move too — it was the
 * later of the two in the one file they shared — so a tie is not a flip.
 */
const outranks = (one: readonly number[], other: readonly number[]): boolean => {
  for (let at = 0; at < 3; at += 1) {
    if ((one[at] ?? 0) !== (other[at] ?? 0)) return (one[at] ?? 0) > (other[at] ?? 0);
  }
  return false;
};

describe("a surface that moved into a layer", () => {
  const generated = rules(read("panda.css"));
  const byHand = rules(read("styles.css"));

  it("is not overruled by a hand-written rule that specificity used to beat", () => {
    const flipped: string[] = [];

    for (const shape of SHAPES) {
      const host = built(shape.html);
      for (const element of host.querySelectorAll("*")) {
        const matching = (set: readonly Rule[]): readonly Rule[] =>
          set.filter((rule) => {
            try {
              return element.matches(stateless(rule.selector));
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
                outranks(weight(rule.selector), weight(old.selector)),
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
      const host = built(shape.html);
      return [...host.querySelectorAll("*")].some((element) =>
        generated.some((rule) => {
          try {
            return element.matches(stateless(rule.selector));
          } catch {
            return false;
          }
        }),
      );
    });
    expect(reached).toBe(true);
  });
});
