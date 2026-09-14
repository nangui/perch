/**
 * Every prop that crosses the wire, and who reads it.
 *
 * `reachable.test.ts` catches a component nobody can put on a page. This is the
 * same fault one level down: a prop a field declares, the server serialises and
 * sends, and no renderer ever looks at. It costs bytes on every request and,
 * worse, it makes a declaration a lie — `.maxDate()` was honoured by the server
 * and ignored by the browser, so a reader picked a date the save then refused.
 *
 * Found by hand, twice, before this existed. The list below is matched exactly
 * rather than treated as a floor: a prop added without a reader fails here, and
 * so does one that gains a reader without leaving the list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Sent, and deliberately unread, with what would have to exist for it to be
 * read. Anything here is a feature not built rather than a reader forgotten —
 * and it is on the wire only because taking it off is a change to the protocol
 * that belongs with the feature.
 */
const SENT_BUT_UNREAD: Readonly<Record<string, string>> = {
  "TextInput.minLength":
    "the server refuses a short value and says so; the browser has nothing " +
    "to do with it until a live counter shows the floor the way `maxLength` " +
    "shows the ceiling",
  "Select.optionsLimit":
    "how many a relationship query returns. A server-side bound the client " +
    "has no use for until it draws something about it",
  "TextInput.step":
    "enforced on the server, which is where it can be. The control is " +
    'deliberately not `type="number"` — spinners, silent locale parsing, a ' +
    "scroll-wheel trap — and `step` means nothing on anything else, so no " +
    "browser could apply it. It crosses for the reader to be told the grain " +
    "before they are refused for missing it, which is a line under the field " +
    "that nobody has drawn yet",
  "Select.preload":
    "fetching a searchable select's options before the reader types. The " +
    "control asks on demand, and nothing decides otherwise yet",
};

/**
 * What `serialise.ts` puts on the wire, as `Type.prop`.
 *
 * Qualified by the type it belongs to, because two components can send a prop
 * of the same name and only one of them may have a reader — which is how a
 * repeater's `collapsible` quietly vouched for a section's.
 */
function crossing(): readonly string[] {
  return [...new Set([...tabled(), ...declared()])].sort();
}

/** The table in `serialise.ts`: the props this package lists for its own. */
function tabled(): readonly string[] {
  const source = readFileSync(
    new URL("../../core/src/serialise.ts", import.meta.url),
    "utf8",
  );
  const block = /const EXTRA_PROPS[^{]*\{([\s\S]*?)\n\};/.exec(source);
  if (block === null) throw new Error("EXTRA_PROPS is not where this expected it");

  // Across lines, not one line each. A list long enough for the formatter to
  // wrap used to vanish from here — and with it every prop of that type, read
  // or not. A guard that goes quiet when a line gets long is worse than none.
  const out: string[] = [];
  for (const entry of (block[1] ?? "").matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    for (const prop of entry[2]?.matchAll(/"(\w+)"/g) ?? []) {
      out.push(`${entry[1] ?? ""}.${prop[1] ?? ""}`);
    }
  }
  return out;
}

/**
 * The same thing said on a class: `get sends()`, beside the type it belongs to.
 *
 * Read as well as the table, because a component may say it either way and one
 * of the two would otherwise be a documented route around this file. Measured
 * before this: moving `Radio.inline` onto its class and taking `Radio` off the
 * list below left every mention of `inline` renameable with nothing failing.
 *
 * Paired with the nearest type above it rather than by file, since one file
 * holds three of them — the prime components do.
 */
function declared(): readonly string[] {
  const out: string[] = [];
  for (const file of coreSources()) {
    const source = readFileSync(file, "utf8");
    const types = [...source.matchAll(/get type\(\): string \{\s*return "(\w+)";/g)];

    for (const sends of source.matchAll(
      /get sends\(\): readonly string\[\] \{\s*return \[([\s\S]*?)\]/g,
    )) {
      const owner = types.filter((one) => one.index < sends.index).at(-1)?.[1];
      if (owner === undefined) continue;
      for (const prop of (sends[1] ?? "").matchAll(/"(\w+)"/g)) {
        out.push(`${owner}.${prop[1] ?? ""}`);
      }
    }
  }
  return out;
}

/** Every source file in core, since a component may live anywhere in it. */
function coreSources(): readonly URL[] {
  const root = new URL("../../core/src/", import.meta.url);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
    .map((name) => new URL(name, root));
}

/** The prop half of `Section.collapsible`. */
function nameOf(qualified: string): string {
  return qualified.slice(qualified.indexOf(".") + 1);
}

/**
 * Code only.
 *
 * Prose is not a reader, and it used to count as one: two sentences in
 * `TextInput.tsx` about "the error badge" vouched for `TextEntry.badge` while
 * nothing drew it. Block comments go, and so do whole-line `//` ones —
 * inline `//` is left alone, because a URL in a string is not a comment.
 */
function code(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n")
      // Hyphen-joined words, which in this codebase are class names and custom
      // properties rather than anything that reads a prop. A word boundary sits
      // on either side of a hyphen, so `perch-badge--neutral` answered for a prop
      // called `badge` and `perch-entry__copy` for one called `copy` — a guard
      // vouching for a reader that is a string in a stylesheet.
      //
      // Whole tokens, not the hyphens: taking out only the punctuation would glue
      // the words together and leave `perchbadgeneutral`, which matches nothing
      // and would hide a genuine mention written the same way.
      .replace(/\b[\w$]+(?:-[\w$]+)+\b/g, " ")
  );
}

/**
 * Where a prop of this type could be read: the registry, and the component
 * named after it.
 *
 * The registry whole, because an adapter reaches its props through helpers
 * beside it — `entryFormat` is not inside `TextEntryRenderer` and reads four of
 * them. The component files by name, because that is where a mention meant for
 * one type used to answer for another.
 *
 * Not the column registry: nothing with extra props is drawn from there, so
 * including it would only let one more file answer for every type.
 */
function mentioned(qualified: string): string {
  const type = qualified.slice(0, qualified.indexOf("."));
  const files = readdirSync(new URL(".", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  }).filter(
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.includes(".test.") &&
      (name === "renderers.tsx" ||
        name.replace(/^.*\//, "").replace(/\.tsx?$/, "") === type),
  );
  return files
    .map((name) => code(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")))
    .join("\n");
}

describe("a prop the server sends", () => {
  it("is read by something, or listed as deliberately not", () => {
    const unread = crossing().filter(
      (prop) => !new RegExp(`\\b${nameOf(prop)}\\b`).test(mentioned(prop)),
    );

    expect(unread).toEqual(Object.keys(SENT_BUT_UNREAD).sort());
  });

  it("is off the deliberate list once something reads it", () => {
    // An allowlist that only grows is a guard that stops guarding, quietly, on
    // the day somebody is in a hurry.
    // Qualified, so one type gaining a reader does not excuse another.
    const claimed = Object.keys(SENT_BUT_UNREAD).filter((prop) =>
      new RegExp(`\\b${nameOf(prop)}\\b`).test(mentioned(prop)),
    );

    expect(claimed).toEqual([]);
  });

  it("watches every type the wire carries, however the file is laid out", () => {
    // The formatter wrapped one list across lines and the parser stopped seeing
    // it — silently, along with every prop of that type. Named here so the next
    // long list cannot do the same.
    const types = new Set(crossing().map((prop) => prop.slice(0, prop.indexOf("."))));

    expect([...types].sort()).toEqual([
      "Callout",
      "CheckboxList",
      "DateTimePicker",
      "Fieldset",
      "FileUpload",
      "Grid",
      "Icon",
      "Image",
      "ImageEntry",
      "KeyValue",
      "MarkdownEditor",
      "Radio",
      "Repeater",
      "RichEditor",
      "Schema",
      "Section",
      "Select",
      "Tab",
      "Tabs",
      "TagsInput",
      "Text",
      "TextEntry",
      "TextInput",
      "Textarea",
      "Toggle",
      "ToggleButtons",
    ]);
  });

  it("is still on the wire at all", () => {
    // The list names props by hand; a rename in core would otherwise leave an
    // entry here guarding nothing.
    const sent = new Set(crossing());
    const gone = Object.keys(SENT_BUT_UNREAD).filter((prop) => !sent.has(prop));

    expect(gone).toEqual([]);
  });
});
