import { describe, expect, it } from "vitest";
import { Action, CreateAction, EditAction } from "./action.js";
import { auditTable } from "./audit.js";
import { Notification } from "./notification.js";
import { declaredActions, Table, serialiseTable } from "./table.js";

/** An action a host writes, which is the only kind that carries a callback. */
class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }

  override get type(): string {
    return "ArchiveAction";
  }

  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

const wire = (action: Action) =>
  serialiseTable(Table.make().actions([action])).actions[0];

describe("a builder that clones", () => {
  it("leaves the one it was called on alone", () => {
    const plain = ArchiveAction.make();
    const labelled = plain.label("Archive");

    expect(plain.state.label).toBeUndefined();
    expect(labelled.state.label).toBe("Archive");
  });

  it("keeps what was set before it, down a long chain", () => {
    // Ordered so every method has something to lose. A chain that sets a value
    // first proves nothing about the method that set it: there was no earlier
    // state for it to drop.
    const built = ArchiveAction.make()
      .requiresConfirmation({ heading: "Archive this?" })
      .action(() => undefined)
      .danger()
      .label("Archive");

    expect(built.state.confirmation).toEqual({ heading: "Archive this?" });
    expect(built.state.run).toBeTypeOf("function");
    expect(built.state.danger).toBe(true);
    expect(built.state.label).toBe("Archive");
  });
});

describe("what the client is told", () => {
  it("is the label, the confirmation and that it is destructive", () => {
    expect(
      wire(
        ArchiveAction.make()
          .label("Archive")
          .danger()
          .requiresConfirmation({ heading: "Sure?", confirmLabel: "Archive it" }),
      ),
    ).toEqual({
      type: "ArchiveAction",
      name: "ArchiveAction",
      trigger: "run",
      label: "Archive",
      danger: true,
      confirmation: { heading: "Sure?", confirmLabel: "Archive it" },
    });
  });

  it("never the callback or the guard, which are the server's", () => {
    const built = ArchiveAction.make()
      .action(() => Notification.make().title("done").success())
      .authorize(() => false);

    // Asserted against the serialised table rather than the node's own keys: a
    // function that survived would be dropped by `JSON.stringify` anyway, and a
    // test that only reads keys would not have noticed it was ever there.
    expect(JSON.stringify(wire(built))).toBe(
      '{"type":"ArchiveAction","name":"ArchiveAction","trigger":"run"}',
    );
    expect(Object.keys(wire(built) ?? {})).toEqual(["type", "name", "trigger"]);
  });

  it("says nothing about a confirmation that was never asked for", () => {
    expect(wire(ArchiveAction.make())).not.toHaveProperty("confirmation");
  });
});

describe("the ready-made actions", () => {
  it("navigate, so they carry no callback and the audit lets them be", () => {
    const table = Table.make()
      .actions([EditAction.make()])
      .headerActions([CreateAction.make()]);

    expect(auditTable(table)).toEqual([]);
  });

  it("are what the framework carries out rather than the author", () => {
    expect(EditAction.make().isBuiltIn).toBe(true);
    expect(ArchiveAction.make().isBuiltIn).toBe(false);
  });
});

describe("two actions under one name", () => {
  it("says so rather than letting the wrong one run", () => {
    // Which one a request reached would depend on the order they were written
    // in, and the other would answer nothing for the life of the panel.
    const table = Table.make().actions([ArchiveAction.make(), ArchiveAction.make()]);

    expect(() => declaredActions(table)).toThrow(/two actions are named/);
  });

  it("counts a row action and a header action as the same namespace", () => {
    // A request names an action, not the place it was drawn.
    const table = Table.make()
      .actions([ArchiveAction.make()])
      .headerActions([ArchiveAction.make()]);

    expect(() => declaredActions(table)).toThrow(/two actions are named/);
  });

  it("is happy once one of them is named apart", () => {
    const table = Table.make().actions([
      ArchiveAction.make(),
      ArchiveAction.make().name("archive-hard"),
    ]);

    expect([...declaredActions(table).keys()]).toEqual([
      "ArchiveAction",
      "archive-hard",
    ]);
  });
});

describe("an action nobody implemented", () => {
  it("stops the boot rather than drawing a button that does nothing", () => {
    expect(
      auditTable(Table.make().actions([ArchiveAction.make().label("Archive")])),
    ).toEqual([
      {
        field: "Archive",
        problem: "has no `action()`, so pressing it would do nothing at all",
      },
    ]);
  });

  it("is named by its type when it has no label to be named by", () => {
    expect(
      auditTable(Table.make().headerActions([ArchiveAction.make()]))[0]?.field,
    ).toBe("ArchiveAction");
  });

  it("says nothing once it has one", () => {
    expect(
      auditTable(Table.make().actions([ArchiveAction.make().action(() => undefined)])),
    ).toEqual([]);
  });
});

describe("a notification", () => {
  it("clones like every other builder here", () => {
    const plain = Notification.make().title("Archived");

    expect(plain.success().state.tone).toBe("success");
    expect(plain.state.tone).toBe("info");
  });

  it("carries what it was given and nothing it was not", () => {
    const made = Notification.make()
      .title("Archived")
      .body("It is out of the list.")
      .success();

    expect(made.state).toEqual({
      title: "Archived",
      body: "It is out of the list.",
      tone: "success",
    });
  });
});
