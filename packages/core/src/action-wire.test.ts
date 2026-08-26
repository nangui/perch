/**
 * Every option an action declares, and whether it crosses.
 *
 * An action reaches a client through exactly one builder, and that is the whole
 * safety of it: table, header and bulk actions all go through `node()`, and a
 * relation manager's list is the same `serialiseTable` under a different scope.
 * So an option added to the state and forgotten there is not dropped in one
 * place and kept in another — it is dropped everywhere, silently, and the
 * declaration compiles and audits clean.
 *
 * `.modalWidth()` and `.slideOver()` were nearly that. This is the guard that
 * catches the next one, in the shape `props-read.test.ts` already uses for the
 * same fault one layer along.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Action } from "./action.js";
import { serialiseTable, Table } from "./table.js";

/**
 * Declared, and deliberately kept back, with the reason.
 *
 * Matched exactly rather than treated as a floor: an option that starts
 * crossing and stays on this list fails here, and so does one that quietly
 * stops.
 */
const KEPT_BACK: Readonly<Record<string, string>> = {
  run:
    "the action's body. A function is not serialisable and what an action " +
    "does is not the client's business",
  authorize:
    "its own guard, asked of every record on the server. A client told which " +
    "rows it may not touch has been told something about them",
  form:
    "said as `hasForm` rather than sent. A schema means nothing until it is " +
    "resolved against a principal, and a table is serialised once for every " +
    "reader",
  excludeAttributes:
    "which columns a copy leaves behind, which is settled where the copy is " +
    "written",
  beforeReplicaSaved: "a last word before a copy is written. A function again",
  inModal:
    "whether a view opens in a dialog or on a page. The client is told by the " +
    "trigger — `show` rather than `link` — because what it does with a press " +
    "is the thing it needs, and a second field saying the same would be a " +
    "second field to disagree",
};

const SOURCE = readFileSync(new URL("./action.ts", import.meta.url), "utf8");

/** Every field the two action states declare. */
function declared(): readonly string[] {
  const names = new Set<string>();
  for (const block of SOURCE.matchAll(
    /export interface \w*ActionState[^{]*\{([\s\S]*?)\n\}/g,
  )) {
    for (const field of (block[1] ?? "").matchAll(/^\s*readonly (\w+)\??:/gm)) {
      names.add(field[1] ?? "");
    }
  }
  return [...names].sort();
}

/**
 * What a node carries, asked of a node rather than read off the builder.
 *
 * An action declaring every option at once, so one field's absence cannot be
 * another's presence. The two that are functions are given something callable
 * so the builder sees them set.
 */
function carried(): ReadonlySet<string> {
  class Everything extends Action {
    static make(): Everything {
      return new Everything({});
    }
    override get type(): string {
      return "Everything";
    }
    protected override with(state: ConstructorParameters<typeof Action>[0]): this {
      return new Everything(state) as this;
    }
  }

  const drawn = serialiseTable(
    Table.make().actions([
      Everything.make()
        .name("named")
        .label("Labelled")
        .requiresConfirmation({ heading: "Sure?" })
        .danger()
        .modalWidth("3xl")
        .slideOver()
        .authorize(() => true)
        .form(undefined as never)
        .action(() => undefined),
    ]),
  ).actions;

  return new Set(Object.keys(drawn[0] ?? {}));
}

describe("an option an action declares", () => {
  it("crosses the wire, or is listed as deliberately kept back", () => {
    const onWire = carried();
    const missing = declared()
      .filter((option) => !onWire.has(option))
      .sort();

    expect(missing).toEqual(Object.keys(KEPT_BACK).sort());
  });

  it("is off the list once it starts crossing", () => {
    // A list that only grows is a guard that stops guarding, quietly, on the
    // day somebody is in a hurry.
    const onWire = carried();

    expect(Object.keys(KEPT_BACK).filter((option) => onWire.has(option))).toEqual([]);
  });

  it("is read off the source, so this cannot pass by finding nothing", () => {
    expect(declared().length).toBeGreaterThan(6);
  });

  it("crosses for a header action and a bulk one as well as a row's", () => {
    // One builder serves all three lists. Said out loud, because "it works on
    // a row" is what a declaration dropped in the other two would also look
    // like from a table page.
    const asking = () =>
      ArchiveEverything.make()
        .modalWidth("2xl")
        .slideOver()
        .action(() => undefined);
    class ArchiveEverything extends Action {
      static make(): ArchiveEverything {
        return new ArchiveEverything({});
      }
      override get type(): string {
        return "ArchiveEverything";
      }
      protected override with(state: ConstructorParameters<typeof Action>[0]): this {
        return new ArchiveEverything(state) as this;
      }
    }

    const tree = serialiseTable(
      Table.make()
        .actions([asking()])
        .headerActions([asking()])
        .bulkActions([asking()]),
    );

    for (const list of [tree.actions, tree.headerActions, tree.bulkActions]) {
      expect(list[0]?.modalWidth).toBe("2xl");
      expect(list[0]?.slideOver).toBe(true);
    }
  });
});
