/**
 * Every component a panel can reach, and every one it cannot, on purpose.
 *
 * A component with no renderer importing it is finished code nobody can put on
 * a page. It compiles, it lints, its own tests pass, and no form can use it —
 * which is why `Toggle` sat here fully built for weeks and was only found by
 * accident, when a file was overwritten and the typecheck objected.
 *
 * The list below is matched exactly rather than treated as a floor. A component
 * added without a renderer fails this, and so does one connected without being
 * taken off the list: an allowlist that only ever grows is a guard that stops
 * guarding, quietly, on the day somebody is in a hurry.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Not yet declared by any field, with the tier that explains why.
 *
 * Taking one off this list means giving it a field in `@perchjs/core` and an
 * entry in the registry — the two things that make it reachable.
 */
const NOT_YET_CONNECTED: Readonly<Record<string, string>> = {
  CodeEditor: "v0.3 — outside the v0.1 catalogue entirely",
};

/**
 * Named by no renderer because another component wears it.
 *
 * A different answer from the list above, and worth keeping apart: those are
 * finished components no form can put on a page, these are pieces that reach
 * one through something else. Taking a name off this list means the thing that
 * wore it is gone — which is the moment to ask whether it should be here at all.
 */
const WORN_BY_ANOTHER: Readonly<Record<string, string>> = {
  ChoiceGroup: "the radios under a radio group and a set of toggle buttons",
  marks: "the shapes a control draws where it would otherwise type a character",
  RichEditorSurface: "the editor a rich editor field fetches in its own chunk",
};

function components(): readonly string[] {
  // Recursive, like the stylesheet's own guard: a component in a subdirectory
  // is a component, and the one that slips past a check is always the one
  // written a little differently from the rest.
  return readdirSync(new URL("./fields", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  })
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => name.replace(/^.*\//, "").replace(/\.tsx$/, ""))
    .sort();
}

/**
 * Named by the module that owns the registry.
 *
 * Direct naming only, which is not the same question as reachability: the
 * components here do import each other — five of them take `StatusMark` from
 * `TextInput` — so one rendered entirely through another would be reported
 * unreachable when it is not.
 *
 * That is the direction to be wrong in. A component reached indirectly raises a
 * false alarm somebody reads and answers; the alternative errs the other way and
 * says nothing at all, which is the failure this whole file exists for. If the
 * indirection ever becomes real, `dependency-cruiser` already in this repo has
 * a `reachable` rule that asks the true question.
 */
function imported(): ReadonlySet<string> {
  const source = readFileSync(new URL("./renderers.tsx", import.meta.url), "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/from "\.\/fields\/([A-Za-z]+)\.js"/g)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

describe("what a panel can reach", () => {
  it("accounts for every component, connected or explained", () => {
    const reachable = imported();
    const unreachable = components().filter((name) => !reachable.has(name));

    expect(unreachable).toEqual(
      [...Object.keys(NOT_YET_CONNECTED), ...Object.keys(WORN_BY_ANOTHER)].sort(),
    );
  });

  it("finds the renderers file naming something at all", () => {
    // Guards the guard: a regex that matched nothing would pass the assertion
    // above by calling every component unreachable, which is the wrong alarm.
    expect(imported().size).toBeGreaterThan(0);
  });

  it("looks at the components that are there rather than a list of them", () => {
    expect(components()).toContain("Toggle");
    expect(components().length).toBeGreaterThan(Object.keys(NOT_YET_CONNECTED).length);
  });
});
