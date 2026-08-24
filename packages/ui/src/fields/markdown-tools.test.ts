/**
 * The list of markdown buttons, which is written twice.
 *
 * Core owns it because the boot audit refuses a `.toolbar()` naming something
 * nobody draws, and the renderer owns it because it is the half that draws.
 * Neither can import the other's copy: core imports nothing, and the renderer
 * takes types from core and no values.
 *
 * So the two are held together here instead. Nothing crashes when they drift —
 * the renderer filters what it does not know — which is the problem: a tool
 * added to core alone passes the audit and draws no button, silently, and that
 * is the fault this repository keeps finding by hand.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS } from "./MarkdownEditor.js";

/** The names inside a `const` array literal, read off the source. */
function listed(source: string, name: string): readonly string[] {
  const at = source.indexOf(name);
  expect(at, `${name} is no longer declared where this test looks`).toBeGreaterThan(-1);
  // From the `=`, not from the name: the type beside it ends in `[]`, and
  // opening at the first bracket reads that empty pair and finds nothing.
  const opened = source.indexOf("[", source.indexOf("= [", at));
  const closed = source.indexOf("]", opened);
  const names = [...source.slice(opened, closed).matchAll(/"([a-zA-Z0-9]+)"/g)].map(
    (found) => found[1] ?? "",
  );

  expect(names.length, `${name} was read as an empty list`).toBeGreaterThan(0);
  return names;
}

const core = readFileSync(
  new URL("../../../core/src/fields/markdown-editor.ts", import.meta.url),
  "utf8",
);

describe("what a toolbar may name", () => {
  it("is the same list the renderer draws", () => {
    expect(listed(core, "MARKDOWN_TOOLS: readonly MarkdownTool[]")).toEqual([...TOOLS]);
  });

  it("is the same list again where the type says it", () => {
    // Declared a third time as a union, which is what a resource is checked
    // against while it is written rather than while it boots.
    const union = core.slice(
      core.indexOf("export type MarkdownTool"),
      core.indexOf(";", core.indexOf("export type MarkdownTool")),
    );

    expect([...union.matchAll(/"([a-zA-Z0-9]+)"/g)].map((f) => f[1])).toEqual([...TOOLS]);
  });

  it("is drawn by a button that says what it is", () => {
    // The other half of the same fault: a name in both lists with no label is
    // a button drawn as an empty square with nothing for a reader to hear.
    const source = readFileSync(
      new URL("./MarkdownEditor.tsx", import.meta.url),
      "utf8",
    );

    for (const tool of TOOLS) {
      expect(source, `${tool} has no button`).toContain(`  ${tool}: { label:`);
      expect(source, `${tool} writes nothing`).toMatch(
        new RegExp(`\\n  ${tool}: \\{ (wrap|head|link)`),
      );
    }
  });

  it("is offered by default only where a button exists for it", () => {
    for (const tool of listed(core, "DEFAULT_TOOLBAR: readonly MarkdownTool[]")) {
      expect(TOOLS as readonly string[]).toContain(tool);
    }
  });
});
