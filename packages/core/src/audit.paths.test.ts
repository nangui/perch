/**
 * A path claimed by two fields.
 *
 * The state is one map keyed by path, so the second field to claim one is a
 * field with no value: it draws, it takes a place on the page, and nothing ever
 * reaches it. Nothing said this until a rich editor was named after a
 * placeholder that already existed and simply came up empty.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import { Placeholder } from "./fields/placeholder.js";
import { Repeater } from "./fields/repeater.js";
import { TextInput } from "./fields/text-input.js";
import { Schema, Section } from "./layout.js";

describe("two fields on one path", () => {
  it("stops the boot, whichever kinds they are", () => {
    const complaints = auditSchema(
      Schema.make([
        Placeholder.make("summary").content(() => "computed"),
        TextInput.make("summary"),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("summary");
    expect(complaints[0]?.problem).toContain("twice");
  });

  it("is caught across the layouts between them", () => {
    // The two are rarely written side by side: one is in a section somebody
    // added last year and the other in the section being written now.
    const complaints = auditSchema(
      Schema.make([
        Section.make("About").schema([TextInput.make("email")]),
        Section.make("Contact").schema([TextInput.make("email")]),
      ]),
    );

    expect(complaints).toHaveLength(1);
  });

  it("says nothing about a form where every path is its own", () => {
    expect(
      auditSchema(Schema.make([TextInput.make("email"), TextInput.make("name")])),
    ).toEqual([]);
  });
});

describe("a repeater's rows", () => {
  it("keep their own paths, which the form outside does not share", () => {
    // `body` in a row is `rows.0.body`, and that is a different path from the
    // `body` beside the repeater.
    expect(
      auditSchema(
        Schema.make([
          TextInput.make("body"),
          Repeater.make("rows").schema([TextInput.make("body")]),
        ]),
      ),
    ).toEqual([]);
  });

  it("are still one place, so a row cannot claim a path twice", () => {
    const complaints = auditSchema(
      Schema.make([
        Repeater.make("rows").schema([TextInput.make("body"), TextInput.make("body")]),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("body");
  });
});
