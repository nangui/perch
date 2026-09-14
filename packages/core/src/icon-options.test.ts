/**
 * No option names a mark without the boot knowing about it.
 *
 * This is the guard the last several fixes were missing. A mark was declared in
 * six places and read in two, and each of the four that went unread failed the
 * same silent way: the renderer found no drawing, so the mark was absent from a
 * screen with nothing at all to say a declaration had been ignored. Each was
 * found by hand, one at a time.
 *
 * So the list stops being a thing to remember. `MARK_OPTIONS` is what the walk
 * reads, and this reads the sources to say that nothing else is out there — a
 * seventh option ending in `Icon` fails here until somebody decides where it is
 * refused.
 *
 * Read from the source rather than from the types: an option nobody wired up is
 * exactly the case, and a type that is never referenced is not a thing a test
 * can ask about at runtime.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_OPTIONS } from "./audit.js";

const HERE = new URL("./", import.meta.url).pathname;

/** Every source in this package, tests aside. */
function sources(): readonly { readonly name: string; readonly text: string }[] {
  const found: { name: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path, `${prefix}${entry}/`);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.includes(".test.")) continue;
      found.push({ name: `${prefix}${entry}`, text: readFileSync(path, "utf8") });
    }
  };
  walk(HERE, "");
  return found;
}

/**
 * Where a mark may still be typed as a plain string.
 *
 * The wire, and only the wire. A declaration names the set, so a misspelling is
 * a compile error before it is ever a boot failure; what arrives over the wire
 * is whatever a client or a plugin put there, and typing that as a name would
 * be a claim nothing checked. The refusal at boot is what covers it instead.
 */
const WIRE: Readonly<Record<string, string>> = {
  "serialise.ts": "the node a schema is sent as",
  "resolve.ts": "the node the cycle resolved",
  "table.ts": "the action node a table is sent as",
};

/** Every declared option whose name says it holds a mark, and how it is typed. */
function declared(): readonly {
  readonly option: string;
  readonly where: string;
  readonly named: boolean;
}[] {
  return sources().flatMap(({ name, text }) =>
    [
      ...text.matchAll(
        /readonly\s+([A-Za-z]*[Ii]cons?)\??:\s*(string|IconName|IconChoice)/g,
      ),
    ].map((found) => ({
      option: found[1] ?? "",
      where: name,
      // `IconChoice` is a name or a function returning one, which the server
      // calls before anything crosses. Either way a misspelling is caught
      // where it is written rather than on a screen.
      named: found[2] !== "string",
    })),
  );
}

describe("an option that names a mark", () => {
  it("is looked for in more than one file", () => {
    // Guards the guard: no sources means the case below passes vacuously.
    expect(new Set(declared().map((one) => one.where)).size).toBeGreaterThan(3);
  });

  it("is one the boot already reads", () => {
    const loose = declared()
      .filter((one) => !(MARK_OPTIONS as readonly string[]).includes(one.option))
      .map((one) => `${one.where}: ${one.option}`);

    // If this fails, the new option is declared and nothing refuses it. Add it
    // to `MARK_OPTIONS` when a component carries it; refuse it where it is read
    // when it is not a component — an action group's and an empty state's are
    // both asked for in `auditTable`, because no walk reaches either.
    expect(loose).toEqual([]);
  });

  it("is typed as a name wherever a resource declares one", () => {
    // What makes a misspelling a compile error rather than only a start-up
    // failure. `string` is left where the wire is written, and nowhere else —
    // a fifth place typing a mark loosely is a place the type stops covering.
    const loose = declared()
      .filter((one) => !one.named)
      .filter((one) => WIRE[one.where] === undefined)
      .map((one) => `${one.where}: ${one.option}`);

    expect(loose).toEqual([]);
  });

  it("has every name in the list actually declared somewhere", () => {
    // The other direction: a name left in the list after the option it named
    // was removed reads as cover the walk no longer provides.
    const found = new Set(declared().map((one) => one.option));

    expect(MARK_OPTIONS.filter((option) => !found.has(option))).toEqual([]);
  });
});
