/**
 * A mark the panel has no drawing for is refused before a panel starts.
 *
 * The union holds while a resource is written in TypeScript. A plugin written
 * in JavaScript, or one cast, puts any string on the wire — and the renderer
 * finds no drawing, so the mark is simply absent from a screen with nothing to
 * say a declaration was ignored. The same silence a modal width had before the
 * boot began refusing one.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import { ICON_NAMES, isIconName } from "./icon.js";
import { Schema, Section } from "./layout.js";
import { TextInput } from "./fields/text-input.js";

const complain = (section: Section): readonly string[] =>
  auditSchema(Schema.make([section])).map((one) => one.problem);

describe("a mark a resource asks for", () => {
  it("is refused when the panel has no drawing for it", () => {
    const said = complain(
      Section.make("Badge").icon("\u{1F426}").schema([TextInput.make("name")]),
    );

    expect(said.some((one) => one.includes("has no drawing for"))).toBe(true);
    // The complaint says what may be asked for instead, rather than only that
    // this was wrong.
    expect(said.some((one) => one.includes("calendar"))).toBe(true);
  });

  it("passes a name the panel draws", () => {
    const said = complain(Section.make("People").icon("users").schema([TextInput.make("name")]));

    expect(said.some((one) => one.includes("icon"))).toBe(false);
  });

  it("says nothing about a section that asked for no mark", () => {
    const said = complain(Section.make("People").schema([TextInput.make("name")]));

    expect(said.some((one) => one.includes("icon"))).toBe(false);
  });

  it("knows its own names", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(10);
    expect(isIconName("trash")).toBe(true);
    expect(isIconName("aubergine")).toBe(false);
  });
});
