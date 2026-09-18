/**
 * What a column may put on its cells, and what the boot refuses.
 *
 * The same question a control's own attributes answer, asked of the same names
 * by the same expression: an attribute allowed on a control and refused on a
 * cell would be two lists drifting apart.
 */
import { describe, expect, it } from "vitest";
import { auditTable } from "./audit.js";
import { TextColumn } from "./column.js";
import { Table } from "./table.js";

const problems = (column: TextColumn): readonly string[] =>
  auditTable(Table.make().columns([column])).map((one) => one.problem);

describe("attributes on a cell", () => {
  it("are allowed where they describe it", () => {
    expect(
      problems(
        TextColumn.make("at").extraAttributes({
          "data-tour": "when",
          "aria-description": "the day it was seen",
          title: "Seen at",
          role: "cell",
        }),
      ),
    ).toEqual([]);
  });

  it("are refused where they instruct a browser", () => {
    // A cell is not a control and a table is not the place to be told what to
    // do. The same rule a field's own attributes are held to.
    const found = problems(TextColumn.make("at").extraAttributes({ onclick: "go()" }));

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("`onclick`");
  });

  it("are refused where they take a name the table already uses", () => {
    // `data-label` is how a row becomes a stack on a narrow screen. Refused at
    // the boot as well as ignored by the renderer, because a column that is
    // unlabelled on a phone and fine on a laptop is a bug nobody reproduces.
    const found = problems(
      TextColumn.make("at").extraAttributes({ "data-label": "stolen" }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("data-label");
  });

  it("say nothing where a column declared none", () => {
    expect(problems(TextColumn.make("at"))).toEqual([]);
  });
});
