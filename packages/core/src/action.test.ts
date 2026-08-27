import { describe, expect, it } from "vitest";
import {
  Action,
  ActionGroup,
  actsOn,
  CreateAction,
  DeleteAction,
  EditAction,
  ForceDeleteAction,
  MODAL_WIDTHS,
  ReplicateAction,
  RestoreAction,
  ViewAction,
} from "./action.js";
import { Schema } from "./layout.js";
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

  it("is happy with one action offered in two places", () => {
    // The same instance, which is what makes "the same code" literal: a row and
    // a ticked selection put the identical declaration through.
    const remove = ArchiveAction.make();
    const table = Table.make().actions([remove]).bulkActions([remove]);

    expect([...declaredActions(table).keys()]).toEqual(["ArchiveAction"]);
  });

  it("is not happy with two built the same way", () => {
    // Indistinguishable on the wire and possibly configured differently. Which
    // one a request reached would depend on the order they were written in.
    const table = Table.make()
      .actions([ArchiveAction.make()])
      .bulkActions([ArchiveAction.make()]);

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

describe("a form on an action that only navigates", () => {
  it("stops the boot, because nothing would ever open it", () => {
    // A link is followed by the browser; no route is asked, so the schema is
    // declared and unreachable.
    const table = Table.make().headerActions([
      CreateAction.make().form(Schema.make([])),
    ]);

    expect(auditTable(table)).toEqual([
      {
        field: "CreateAction",
        problem: "collects a form but only navigates, so nothing would open it",
      },
    ]);
  });

  it("says nothing about a link that collects nothing", () => {
    expect(auditTable(Table.make().actions([EditAction.make()]))).toEqual([]);
  });
});

describe("which rows an action means anything on", () => {
  it("is answered here, so a client does not have to know what each one does", () => {
    // A restore has nothing to do to a row that was never hidden; a delete has
    // nothing to do to one already hidden; a copy cannot reach one at all,
    // because the read that finds its subject leaves marked rows out.
    expect(actsOn(RestoreAction.make())).toBe("marked");
    expect(actsOn(DeleteAction.make())).toBe("live");
    expect(actsOn(ReplicateAction.make())).toBe("live");
    // Destroying for good is the one that works on both: a row can be
    // destroyed whether or not it was hidden first.
    expect(actsOn(ForceDeleteAction.make())).toBe("either");
  });

  it("is live for a view, whether it navigates or opens in place", () => {
    // A view of a hidden row is a page that answers 404 and a dialog asking for
    // a record the read leaves out. The button should not be there either way.
    expect(actsOn(ViewAction.make())).toBe("live");
    expect(actsOn(ViewAction.make().inModal())).toBe("live");
  });

  it("is either, for an action nothing was said about", () => {
    expect(actsOn(EditAction.make())).toBe("either");
    expect(actsOn(ArchiveAction.make())).toBe("either");
  });

  it("crosses the wire, except where it is the answer silence gives", () => {
    const drawn = serialiseTable(
      Table.make().actions([ReplicateAction.make(), EditAction.make()]),
    ).actions;

    expect(drawn[0]?.actsOn).toBe("live");
    // Sending "either" would put a word on every action in every tree to say
    // what its absence already says.
    expect(drawn[1]?.actsOn).toBeUndefined();
  });
});

/** What the boot says about a width, and nothing it says about anything else. */
const widthComplaints = (action: Action): readonly string[] =>
  auditTable(Table.make().actions([action]))
    .map((one) => one.problem)
    .filter((problem) => problem.includes("width"));

describe("how a modal opens", () => {
  it("crosses as the width the action asked for", () => {
    const drawn = serialiseTable(
      Table.make().actions([ArchiveAction.make().modalWidth("3xl")]),
    ).actions;

    expect(drawn[0]?.modalWidth).toBe("3xl");
  });

  it("crosses as opening against the side, where it was asked to", () => {
    const drawn = serialiseTable(
      Table.make().actions([ArchiveAction.make().slideOver()]),
    ).actions;

    expect(drawn[0]?.slideOver).toBe(true);
  });

  it("says nothing where the action said nothing", () => {
    // Absent, so the dialog keeps the width its content implies: a sentence
    // for a question, and enough for a form that its fields are not as narrow
    // as their placeholders.
    const drawn = serialiseTable(Table.make().actions([ArchiveAction.make()])).actions;

    expect(drawn[0]?.modalWidth).toBeUndefined();
    expect(drawn[0]?.slideOver).toBeUndefined();
  });

  it("stops the boot where the width is not one", () => {
    // The union holds while the resource is written in TypeScript. A plugin
    // written in JavaScript, or one cast, puts any string on the wire — and the
    // stylesheet finds no rule, falls back to the default, and opens a panel
    // that is not the one that was asked for with nothing to say so.
    const complaints = widthComplaints(
      ArchiveAction.make().modalWidth("enormous" as never),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain("enormous");
    expect(complaints[0]).toContain("7xl");
  });

  it("says nothing about every width there is", () => {
    for (const width of MODAL_WIDTHS) {
      expect(widthComplaints(ArchiveAction.make().modalWidth(width)), width).toEqual(
        [],
      );
    }
  });

  it("is a clone away, like every other declaration", () => {
    const plain = ArchiveAction.make();

    expect(plain.modalWidth("lg").state.modalWidth).toBe("lg");
    expect(plain.state.modalWidth).toBeUndefined();
    expect(plain.slideOver().state.slideOver).toBe(true);
    expect(plain.state.slideOver).toBeUndefined();
  });
});

describe("a form on an action that only shows", () => {
  it("stops the boot, because nothing would open it", () => {
    // The client draws the record and never looks at the schema, so it is
    // collected by nobody and shown to nobody.
    const complaints = auditTable(
      Table.make().actions([ViewAction.make().inModal().form(Schema.make([]))]),
    ).map((one) => one.problem);

    expect(complaints).toEqual([expect.stringContaining("only shows a record")]);
  });
});

describe("a view opened in place", () => {
  it("navigates by default, which is the one that needs no client", () => {
    const plain = ViewAction.make();

    expect(plain.trigger).toBe("link");
    expect(plain.page).toBe("view");
  });

  it("shows rather than navigates where it was asked to", () => {
    const opened = ViewAction.make().inModal();

    expect(opened.trigger).toBe("show");
    // No page, because it is not going anywhere. A link the browser follows and
    // a dialog it opens are not two ways of doing one thing.
    expect(opened.page).toBeUndefined();
  });

  it("carries neither a body nor a question", () => {
    // Nothing is carried out, so there is nothing to agree to. A confirmation
    // would be asking a reader to consent to being shown something.
    const node = serialiseTable(
      Table.make().actions([ViewAction.make().inModal().modalWidth("2xl")]),
    ).actions[0];

    expect(node?.trigger).toBe("show");
    expect(node?.hasForm).toBeUndefined();
    expect(node?.modalWidth).toBe("2xl");
  });

  it("is a clone away, like every other declaration", () => {
    const plain = ViewAction.make();

    expect(plain.inModal().trigger).toBe("show");
    expect(plain.trigger).toBe("link");
  });
});

describe("several actions under one name", () => {
  const grouped = () =>
    ActionGroup.make([RestoreAction.make(), ForceDeleteAction.make()])
      .label("Recovery")
      .icon("↩");

  it("is presentation, so the allowlist still names what it holds", () => {
    // A group that hid an action from the allowlist would be a place to put
    // one a request could reach without the route ever having declared it.
    const table = Table.make().actions([EditAction.make(), grouped()]);

    expect([...declaredActions(table).keys()].sort()).toEqual([
      "EditAction",
      "ForceDeleteAction",
      "RestoreAction",
    ]);
  });

  it("is opened out for everything the boot asks", () => {
    // An action with no `action()` is refused whether or not it is in a group.
    // Named by the action rather than the group, which is what says the group
    // was opened out and not merely walked over: an unflattened list complains
    // about the group itself, which is the same count and the wrong thing.
    const complaints = auditTable(
      Table.make().actions([
        ActionGroup.make([ArchiveAction.make()]).label("Recovery"),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("ArchiveAction");
    expect(complaints[0]?.problem).toContain("no `action()`");
  });

  it("crosses as a node holding its own", () => {
    const node = serialiseTable(Table.make().actions([grouped()])).actions[0];

    expect(node?.type).toBe("ActionGroup");
    expect(node?.trigger).toBe("group");
    expect(node?.label).toBe("Recovery");
    expect(node?.icon).toBe("↩");
    expect(node?.children?.map((one) => one.type)).toEqual([
      "RestoreAction",
      "ForceDeleteAction",
    ]);
  });

  it("keeps what each of them said about itself", () => {
    // The grouping is the only thing a group adds. Everything an action
    // declared reaches the client the same way it would have alone.
    const node = serialiseTable(Table.make().actions([grouped()])).actions[0];

    expect(node?.children?.[0]?.actsOn).toBe("marked");
    expect(node?.children?.[1]?.danger).toBe(true);
  });

  it("has a name of its own, so two groups are two entries", () => {
    const tree = serialiseTable(
      Table.make().actions([
        ActionGroup.make([RestoreAction.make()]).label("Recovery"),
        ActionGroup.make([ForceDeleteAction.make()]).label("Danger"),
      ]),
    );

    expect(tree.actions.map((one) => one.name)).toEqual(["Recovery", "Danger"]);
  });

  it("is a clone away, like every other declaration", () => {
    const plain = ActionGroup.make([RestoreAction.make()]);

    expect(plain.label("Recovery").state.label).toBe("Recovery");
    expect(plain.state.label).toBe("More");
  });
});

describe("a header action the panel cannot draw", () => {
  it("is named rather than dropped in silence", () => {
    // A header offers one thing: a link to the create page. A run there has no
    // record to act on, and any other link is an address the client cannot
    // build — so both crossed the wire and were drawn by nobody.
    const complaints = auditTable(
      Table.make().headerActions([ArchiveAction.make().action(() => undefined)]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("not a `CreateAction`");
  });

  it("says the same of a group put there", () => {
    // Grouping is what somebody reaches for when a header has more than one
    // thing in it, which is exactly when they would find out it draws none.
    const complaints = auditTable(
      Table.make().headerActions([
        ActionGroup.make([CreateAction.make()]).label("New"),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("New");
  });

  it("says nothing about the one it does draw", () => {
    expect(auditTable(Table.make().headerActions([CreateAction.make()]))).toEqual([]);
  });
});

describe("two entries under one word", () => {
  it("is refused for two groups, which nothing else was watching", () => {
    // A group answers to its label the way an action answers to its name, and
    // both end up in one list on the wire. `declaredActions` refuses the
    // ambiguity for actions and never sees a group.
    const complaints = auditTable(
      Table.make().actions([
        ActionGroup.make([RestoreAction.make()]),
        ActionGroup.make([ForceDeleteAction.make()]),
      ]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("More");
    expect(complaints[0]?.problem).toContain("row");
  });

  it("is refused for a group standing where an action already is", () => {
    const complaints = auditTable(
      Table.make().actions([
        ArchiveAction.make()
          .name("Recovery")
          .action(() => undefined),
        ActionGroup.make([RestoreAction.make()]).label("Recovery"),
      ]),
    );

    expect(complaints).toEqual([expect.objectContaining({ field: "Recovery" })]);
  });

  it("says nothing where the two lists happen to share one", () => {
    // One action offered on a row and over a selection is the point: the same
    // instance in two lists is one thing in two places.
    const shared = ArchiveAction.make().action(() => undefined);

    expect(auditTable(Table.make().actions([shared]).bulkActions([shared]))).toEqual(
      [],
    );
  });

  it("names the list it found them in", () => {
    const complaints = auditTable(
      Table.make().bulkActions([
        ActionGroup.make([RestoreAction.make()]),
        ActionGroup.make([ForceDeleteAction.make()]),
      ]),
    );

    expect(complaints[0]?.problem).toContain("selection");
  });
});
