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

function declared(): readonly string[] {
  const files = SOURCES.flatMap((directory) =>
    readdirSync(new URL(directory, CORE), { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
      .map((name) => `${directory}/${name}`),
  ).concat("layout.ts");

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
});
