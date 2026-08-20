/**
 * Every filter a table can declare, and a control for each.
 *
 * The narrowing bar skips a type it has no meaning for. That is right for a
 * client meeting something newer than itself, and it is how a filter added to
 * `@perchjs/core` and never given a control here disappears: declared, audited,
 * serialised, sent — and gone, with the reader looking at a bar that is missing
 * one and no way to tell.
 *
 * Read off the source rather than a list kept beside it, because a list beside
 * it is the thing that goes stale on the day somebody is in a hurry.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The classes `filter.ts` exports, which is what a table can put in a bar. */
function declared(): readonly string[] {
  const source = readFileSync(
    new URL("../../core/src/filter.ts", import.meta.url),
    "utf8",
  );
  return [...source.matchAll(/^export class (\w+Filter) extends Filter/gm)]
    .map((found) => found[1] as string)
    .sort();
}

/** The type names the bar tests before it draws anything. */
function drawn(): readonly string[] {
  const source = readFileSync(new URL("./PanelList.tsx", import.meta.url), "utf8");
  return [...source.matchAll(/filter\.type === "(\w+Filter)"/g)]
    .map((found) => found[1] as string)
    .sort();
}

describe("the filters a table can declare", () => {
  it("each have a control the bar knows how to draw", () => {
    expect(new Set(drawn())).toEqual(new Set(declared()));
  });

  it("are read off the source, so this cannot pass by finding nothing", () => {
    expect(declared().length).toBeGreaterThan(3);
  });
});
