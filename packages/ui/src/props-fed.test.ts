/**
 * Every prop a control declares, and who passes it.
 *
 * `props-read.test.ts` catches a prop the server sends that no renderer looks
 * at. This is the same fault from the other end: a prop a control declares,
 * draws, and no adapter ever passes. Both leave a declaration that reads like a
 * feature; neither shows up on a page.
 *
 * It is the harder one to notice, because nothing is missing to see. The
 * control's file is complete — the prop is typed, destructured and rendered —
 * and the only sign is that the thing never appears. `prefix` and `suffix` sat
 * like that from the day the control was written: drawn, styled, passed by
 * nobody, with every other guard green.
 *
 * Read off the source rather than a list kept beside it, because a list beside
 * it goes stale on the day somebody is in a hurry.
 *
 * What it does not catch: a helper that builds the props and that nobody calls.
 * The registry is read whole, so the names inside such a helper still answer
 * for the props — the same scope the sibling guard takes, and the same limit.
 * What it does catch is the case that was actually here: a prop the registry
 * has never named at all.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Drawn, and deliberately not passed, with what would have to exist to pass it.
 *
 * Anything here is a feature not finished rather than a wire forgotten. Matched
 * exactly rather than treated as a ceiling: a prop that gains a caller and
 * stays on this list fails here, and so does one that quietly loses its caller.
 */
const DRAWN_BUT_UNFED: Readonly<Record<string, string>> = {
  "CodeEditor.filename":
    "the name shown above the editor. No field declares one, and a filename " +
    "invented by the browser is a label nobody wrote",
  "CodeEditor.diagnostic":
    "an error against a line, which needs a server that parses what was typed " +
    "and says where it went wrong. Nothing does yet",
  "CodeEditor.emptyNote":
    "what an empty editor says. No field declares one, and the placeholder " +
    "every other field already has says the same thing",
  "DateTimePicker.today":
    "which day to mark as today — a question about the field's own zone rather " +
    "than the browser's, and the zone is not on the wire",
  "SearchableSelect.debounce":
    "how long to wait before asking. The field's `live()` debounce is a " +
    "different clock for a different round trip, and tying the two would make " +
    "one wait answer for both",
  "Select.awaiting":
    "shown while options are fetched. They arrive with the tree today, so " +
    "there is no moment to show it in",
  "Select.emptyLabel":
    "what the empty choice reads as. Nothing declares one, and the word the " +
    "control already uses is the word every other select uses",
  "TextInput.suffixOk":
    "marks a suffix as a confirmation rather than a unit. It needs a field " +
    "that says a value was verified, which is a different feature from a suffix",
  "TextInput.progress":
    "the hairline that fills while a round trip runs. It needs a fraction, and " +
    "a request in flight reports that it is in flight and nothing more",
  "Toggle.tag":
    "a short annotation beside the label — `canonical`, `400 ms`, `server`. The " +
    "slot is designed and its accessibility settled; what is missing is a field " +
    "that has something to annotate",
};

/**
 * Source with the prose taken out.
 *
 * A comment naming a prop is not a caller passing one, and this codebase
 * explains itself at length: `filename` answered for a control's prop from a
 * remark in a different file about a file input keeping its last name.
 *
 * Hyphen-joined words go too, for the reason the sibling guard gives: they are
 * class names and custom properties, and a word boundary sits on either side of
 * a hyphen — `perch-control__progress` would vouch for `progress`.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/\b[\w$]+(?:-[\w$]+)+\b/g, " ");
  // A name bound here is not a name passed on. `value.map((tag) => …)` in one
  // control vouched for another control's `tag` prop, which is a guard
  // answering for a local variable.
}

interface Control {
  readonly name: string;
  readonly file: string;
  readonly source: string;
}

/** Every file the panel draws a field or an entry with. */
function controls(): readonly Control[] {
  const here = new URL(".", import.meta.url);
  return readdirSync(here, { recursive: true, encoding: "utf8" })
    .filter(
      (name) =>
        name.endsWith(".tsx") &&
        !name.includes(".test.") &&
        (name.startsWith("fields/") || name.startsWith("entries/")),
    )
    .map((name) => ({
      name: name.replace(/^.*\//, "").replace(/\.tsx$/, ""),
      file: name,
      source: readFileSync(new URL(name, here), "utf8"),
    }));
}

/** The props one declares, qualified as `Control.prop`. */
function declared(control: Control): readonly string[] {
  const block = /export interface \w*Props \{([\s\S]*?)\n\}/.exec(control.source);
  if (block === null) return [];

  return [...(block[1] ?? "").matchAll(/^\s*readonly (\w+)\??:/gm)].map(
    (found) => `${control.name}.${found[1] ?? ""}`,
  );
}

/**
 * Everything that could pass a prop to that control — which is every file but
 * its own.
 *
 * Its own is excluded because it says nothing about who calls it: it declares
 * the prop, destructures it and draws it, and all three read like a use. That
 * is the whole shape being looked for.
 *
 * The other controls count, because one wraps another: a searchable select is
 * drawn inside a select, and what that passes down is passed by a real caller.
 */
function callersOf(control: string, everything: readonly Control[]): string {
  return code(
    [
      // The registry whole, because an adapter reaches a control through
      // helpers beside it: the affixes are passed from a loop over their own
      // names, and an entry's formatting is assembled before it is handed over.
      readFileSync(new URL("./renderers.tsx", import.meta.url), "utf8"),
      // The other controls only where they draw this one, because one wraps
      // another — a choice group is drawn inside a radio. Only the attribute
      // list, though: a local named after a prop is not a caller passing it,
      // and `value.map((tag) => …)` in one control vouched for another's `tag`.
      ...everything
        .filter((one) => one.name !== control)
        .flatMap((one) => [
          ...one.source.matchAll(new RegExp(`<${control}\\b[^>]*>`, "g")),
        ])
        .map((found) => found[0]),
    ].join("\n"),
  );
}

/**
 * Named anywhere outside the control's own file.
 *
 * A plain mention rather than a shape like `prop={…}`, because an adapter
 * reaches a control through helpers and lists: the affixes are passed from a
 * loop over their own names, and an entry's formatting is assembled before it
 * is handed over. A stricter pattern called both of those unfed.
 *
 * The discrimination is the file, not the shape. Every prop is declared,
 * destructured and drawn in its own control, so its own file always matches —
 * and a search that includes it can only ever say yes.
 */
function passed(prop: string, source: string): boolean {
  return new RegExp(`\\b${prop.slice(prop.indexOf(".") + 1)}\\b`).test(source);
}

/** Every declared prop no other file passes. */
function unfed(): readonly string[] {
  const everything = controls();
  return everything
    .flatMap((control) =>
      declared(control).filter(
        (prop) => !passed(prop, callersOf(control.name, everything)),
      ),
    )
    .sort();
}

describe("a prop a control declares", () => {
  it("is passed by something, or listed as deliberately not", () => {
    expect(unfed()).toEqual(Object.keys(DRAWN_BUT_UNFED).sort());
  });

  it("is off the deliberate list once something passes it", () => {
    // A list that only grows is a guard that stops guarding, quietly, on the
    // day somebody is in a hurry.
    const missing = unfed();
    expect(
      Object.keys(DRAWN_BUT_UNFED).filter((one) => !missing.includes(one)),
    ).toEqual([]);
  });

  it("is read off the source, so this cannot pass by finding nothing", () => {
    expect(controls().flatMap(declared).length).toBeGreaterThan(40);
  });
});
