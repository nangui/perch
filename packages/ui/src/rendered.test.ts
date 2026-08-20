/**
 * Every component a schema can carry, and the renderer that draws it.
 *
 * `reachable.test.ts` asks the mirror of this and is not a substitute: it reads
 * the files in `./fields` and finds one the registry never imports. That
 * catches a renderer nobody connected. It cannot catch what `TextEntry` was —
 * a component declared in `@perchjs/core`, served by a route, with no renderer
 * anywhere. The panel drew a marker where the value belonged and every test in
 * the repository stayed green.
 *
 * So this one starts from the declaration instead. A type a schema can hold and
 * the registry does not know is a page with a hole in it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Declared and deliberately undrawn, with what would take it off this list.
 *
 * Not a floor. A component connected without leaving here fails too: a list
 * that only grows is a guard that stopped guarding on the day somebody was in
 * a hurry.
 */
const NOT_DRAWN: Readonly<Record<string, string>> = {};

const CORE = new URL("../../core/src/", import.meta.url);

/**
 * The directories the registry serves. Actions, columns and filters declare a
 * `type` too and are drawn by the table and the action bar, not from here.
 */
const SOURCES = ["fields", "entries"];

/**
 * The files at the root of core that declare a component type.
 *
 * Named one by one rather than swept up, so adding a branch to the tree means
 * saying so here — which is the moment to notice it is not drawn. `prime.ts`
 * arrived without this line and three types went unwatched: unregistering one
 * of them left every test in this file green.
 */
const ROOTS = ["layout.ts", "prime.ts"];

function declared(): readonly string[] {
  const files = SOURCES.flatMap((directory) =>
    readdirSync(new URL(directory, CORE), { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
      .map((name) => `${directory}/${name}`),
  ).concat(ROOTS);

  const types: string[] = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, CORE), "utf8");
    for (const match of source.matchAll(/get type\(\): string \{\s*return "(\w+)";/g)) {
      const name = match[1];
      if (name !== undefined) types.push(name);
    }
  }
  return [...new Set(types)].sort();
}

function registered(): ReadonlySet<string> {
  const source = readFileSync(new URL("./renderers.tsx", import.meta.url), "utf8");
  return new Set(
    [...source.matchAll(/registerComponent\("(\w+)"/g)].flatMap((m) =>
      m[1] === undefined ? [] : [m[1]],
    ),
  );
}

/** The tone names core declares, read off its own union. */
function tones(): readonly string[] {
  const source = readFileSync(new URL("entries/text-entry.ts", CORE), "utf8");
  const union = /export type EntryTone =([^;]*);/.exec(source);
  if (union === null) throw new Error("EntryTone is not where this expected it");
  return [...(union[1] ?? "").matchAll(/"(\w+)"/g)]
    .flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
    .sort();
}

/** The ones the renderer will actually draw, off its own list. */
function drawn(): readonly string[] {
  const source = readFileSync(
    new URL("./entries/TextEntry.tsx", import.meta.url),
    "utf8",
  );
  const set = /const TONES = new Set\(\[([^\]]*)\]\)/.exec(source);
  if (set === null) throw new Error("TONES is not where this expected it");
  return [...(set[1] ?? "").matchAll(/"(\w+)"/g)]
    .flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
    .sort();
}

describe("the colours an entry may take", () => {
  it("are the same list in both packages", () => {
    // Two spellings in two packages is one addition away from a tone the server
    // sends and the browser quietly turns into `neutral`.
    expect(drawn()).toEqual(tones());
  });

  it("each have a rule in the stylesheet, as a pill and as words", () => {
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const missing = tones().flatMap((tone) => [
      ...(styles.includes(`.perch-badge--${tone}`) ? [] : [`badge:${tone}`]),
      ...(styles.includes(`[data-tone="${tone}"]`) ? [] : [`text:${tone}`]),
    ]);

    expect(missing).toEqual([]);
  });
});

describe("what a schema can carry", () => {
  it("has a renderer for every one of it, or an explanation", () => {
    const known = registered();
    const undrawn = declared().filter((type) => !known.has(type));

    expect(undrawn).toEqual(Object.keys(NOT_DRAWN).sort());
  });

  it("finds components at all, so a regex that matched nothing cannot pass", () => {
    // Guards the guard from the other side: an empty declaration list would
    // call everything drawn and say nothing, ever.
    expect(declared()).toContain("TextInput");
    expect(declared().length).toBeGreaterThan(10);
  });

  it("finds the registry naming something at all", () => {
    expect(registered().size).toBeGreaterThan(10);
  });

  it("draws nothing a schema cannot carry, which is the other direction", () => {
    // Asking only whether every declared type is drawn leaves the mirror
    // unwatched: a renderer registered under a name core does not declare is
    // dead code that looks connected, and a type this file cannot see is one
    // it will never report. Both are caught by matching the two lists.
    const known = new Set(declared());
    const spurious = [...registered()].filter((type) => !known.has(type));

    expect(spurious).toEqual([]);
  });
});
