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
  const source = readFileSync(
    new URL("../../core/src/serialise.ts", import.meta.url),
    "utf8",
  );
  const block = /const EXTRA_PROPS[^{]*\{([\s\S]*?)\n\};/.exec(source);
  if (block === null) throw new Error("EXTRA_PROPS is not where this expected it");

  const out: string[] = [];
  for (const line of (block[1] ?? "").split("\n")) {
    const entry = /^\s*(\w+):\s*\[([^\]]*)\]/.exec(line);
    if (entry === null) continue;
    for (const prop of entry[2]?.matchAll(/"(\w+)"/g) ?? []) {
      out.push(`${entry[1] ?? ""}.${prop[1] ?? ""}`);
    }
  }
  return [...new Set(out)].sort();
}

/** The prop half of `Section.collapsible`. */
function nameOf(qualified: string): string {
  return qualified.slice(qualified.indexOf(".") + 1);
}

/** Every word this package mentions, outside its own tests. */
function mentioned(): string {
  const files = readdirSync(new URL(".", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  }).filter(
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."),
  );
  return files
    .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
    .join("\n");
}

describe("a prop the server sends", () => {
  it("is read by something, or listed as deliberately not", () => {
    const source = mentioned();
    const unread = crossing().filter(
      (prop) => !new RegExp(`\\b${nameOf(prop)}\\b`).test(source),
    );

    expect(unread).toEqual(Object.keys(SENT_BUT_UNREAD).sort());
  });

  it("is off the deliberate list once something reads it", () => {
    // An allowlist that only grows is a guard that stops guarding, quietly, on
    // the day somebody is in a hurry.
    const source = mentioned();
    // Qualified, so one type gaining a reader does not excuse another.
    const claimed = Object.keys(SENT_BUT_UNREAD).filter((prop) =>
      new RegExp(`\\b${nameOf(prop)}\\b`).test(source),
    );

    expect(claimed).toEqual([]);
  });

  it("is still on the wire at all", () => {
    // The list names props by hand; a rename in core would otherwise leave an
    // entry here guarding nothing.
    const sent = new Set(crossing());
    const gone = Object.keys(SENT_BUT_UNREAD).filter((prop) => !sent.has(prop));

    expect(gone).toEqual([]);
  });
});
