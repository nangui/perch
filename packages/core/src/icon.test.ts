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
import { auditInfolist, auditSchema } from "./audit.js";
import { ICON_NAMES, isIconName } from "./icon.js";
import { Schema, Section } from "./layout.js";
import { TextInput } from "./fields/text-input.js";
import { TextEntry } from "./entries/text-entry.js";

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

  it("is refused on an infolist too, which walks its own tree", () => {
    // Two walks, not one. A section, a tab and an `Icon` are declared on both
    // sides, and a mark refused on a form while it went through on an infolist
    // is a closed set with a door in it — which is what this was.
    const said = auditInfolist(
      Schema.make([
        Section.make("Badge").icon("\u{1F426}").schema([TextEntry.make("name")]),
      ]),
    ).map((one) => one.problem);

    expect(said.some((one) => one.includes("has no drawing for"))).toBe(true);
  });

  it("is refused on a hint's mark too, which is a second mark on one field", () => {
    // `hintIcon` sits on `Component`, so every node the walk reaches can carry
    // one — beside a different word and at a different size, but out of the
    // same set and refused the same way.
    const said = complain(
      Section.make("People").schema([
        TextInput.make("email").hint("Where links go").hintIcon("\u2709"),
      ]),
    );

    expect(said.some((one) => one.includes("has no drawing for"))).toBe(true);
  });

  it("passes a hint's mark the panel draws", () => {
    const said = complain(
      Section.make("People").schema([
        TextInput.make("email").hint("Where links go").hintIcon("link"),
      ]),
    );

    expect(said.some((one) => one.includes("icon"))).toBe(false);
  });

  it("is refused on either side of a control's frame", () => {
    // A text input carries two more, inside the frame rather than beside a
    // word. Same set, same refusal, and both sides asked separately: one right
    // and one wrong is a control with half a mark.
    const bad = (field: TextInput): readonly string[] =>
      complain(Section.make("People").schema([field]));

    expect(
      bad(TextInput.make("site").prefixIcon("\u{1F310}")).some((one) =>
        one.includes("has no drawing for"),
      ),
    ).toBe(true);
    expect(
      bad(TextInput.make("site").suffixIcon("\u{1F310}")).some((one) =>
        one.includes("has no drawing for"),
      ),
    ).toBe(true);
    expect(bad(TextInput.make("site").prefixIcon("link").suffixIcon("check"))).toEqual(
      [],
    );
  });

  it("knows its own names", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(10);
    expect(isIconName("trash")).toBe(true);
    expect(isIconName("aubergine")).toBe(false);
  });
});
