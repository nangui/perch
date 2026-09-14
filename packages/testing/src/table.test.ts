/**
 * The table and action chains, against a panel that is really running.
 *
 * The claims under test are the two the documentation makes about them: that a
 * test sees the rows a reader would see — filtered by the same policy and
 * narrowed by the same filters — and that the number of queries a page cost is
 * a thing a test can hold the panel to. The second is the N+1 guardrail, and
 * it is the only assertion here that is not about something a browser can see.
 */
import { Injectable, Module } from "@nestjs/common";
import type {
  DataAdapter,
  FieldMeta,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  Schema as SchemaTree,
  Table as TableTree,
} from "@perchjs/core";
import {
  Action,
  Notification,
  Schema,
  SelectFilter,
  Table,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import type { PanelAssets } from "@perchjs/nest";
import { PanelModule, PanelResource } from "@perchjs/nest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPanelTest } from "./harness.js";
import type { PanelTest } from "./harness.js";

const text = (name: string): FieldMeta => ({
  name,
  kind: "scalar",
  type: "String",
  isRequired: false,
  isList: false,
  isId: false,
  isUnique: false,
  isReadOnly: false,
  hasDefault: false,
  isLongText: false,
});

const KEY: FieldMeta = {
  name: "id",
  kind: "scalar",
  type: "Int",
  isRequired: true,
  isList: false,
  isId: true,
  isUnique: true,
  isReadOnly: true,
  hasDefault: true,
  isLongText: false,
};

let rows: Row[] = [];
/** What each run of an action touched, so a test can say whether it ran. */
const ran: Id[] = [];

/** One model, said the same way twice: the projection reads the IR and the
 *  panel reads `meta`, and a fixture where they disagree sends rows with no key
 *  on them — which looks exactly like a panel that lost them. */
const POST: ModelMeta = {
  name: "Post",
  dbName: "Post",
  primaryKey: KEY,
  fields: [KEY, text("title"), text("status")],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: false,
  labelField: "title",
};

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [POST] };
  }
  meta(): ModelMeta {
    return POST;
  }
  /**
   * One query for the page, whatever the filters say.
   *
   * Which is the shape the counter is meant to prove: a relation named by a
   * column arrives with the rows rather than one row at a time.
   */
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    // The filter arrives as a clause, which is what the panel turns a declared
    // filter into: a path, an operator and a value.
    let found = rows;
    for (const clause of query.clauses ?? []) {
      // `in` on the key is how a selection is loaded: an action asks for the
      // rows it was given, and an adapter that ignored it would hand every row
      // to every action.
      if (clause.operator === "in" && Array.isArray(clause.value)) {
        const keys = clause.value as unknown[];
        found = found.filter((one) => keys.includes(one[clause.path]));
        continue;
      }
      found = found.filter((one) => one[clause.path] === clause.value);
    }
    return Promise.resolve({ rows: found, total: found.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(rows.find((one) => one["id"] === id) ?? null);
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(
    _model: string,
    id: Id,
    data: { set?: Record<string, unknown> },
  ): Promise<Row> {
    const at = rows.findIndex((one) => one["id"] === id);
    if (at >= 0) rows[at] = { ...rows[at], ...(data.set ?? {}) };
    return Promise.resolve(rows[at] ?? {});
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  forceDelete(): Promise<number> {
    return Promise.resolve(0);
  }
  restore(): Promise<number> {
    return Promise.resolve(0);
  }
  attach(): Promise<void> {
    return Promise.resolve();
  }
  detach(): Promise<void> {
    return Promise.resolve();
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

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

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): SchemaTree {
    return Schema.make([TextInput.make("title")]);
  }
  table(): TableTree {
    return Table.make()
      .columns([TextColumn.make("title").label("Title")])
      .filters([
        SelectFilter.make("status")
          .label("Status")
          .options([
            { value: "live", label: "Live" },
            { value: "draft", label: "Draft" },
          ]),
      ])
      .bulkActions([
        ArchiveAction.make()
          .name("archive")
          .label("Archive")
          .action((record) => {
            ran.push(record["id"] as Id);
            return Notification.make().title("Post archived").success();
          }),
        // Declared, drawn for nobody, and refused if called: the button was
        // never the protection.
        // Raises where it runs, so a test can tell a panel that fell over from
        // an action that turned the record down.
        ArchiveAction.make()
          .name("boom")
          .label("Boom")
          .action(() => {
            throw new Error("the action fell over");
          }),
        ArchiveAction.make()
          .name("purge")
          .label("Purge")
          .authorize(() => false)
          .action(() => Notification.make().title("Purged").success()),
      ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-table-"));
  writeFileSync(join(directory, "a.js"), "");
  writeFileSync(join(directory, "a.css"), "");
  return {
    directory,
    entries: { "panel.js": "a.js", "panel.css": "a.css" },
    chunks: [],
  };
}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PostResource],
      dataAdapter: MemoryAdapter,
      assets: assets(),
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class AdminModule {}

let panel: PanelTest | undefined;

beforeEach(() => {
  rows = [
    { id: 1, title: "Live one", status: "live" },
    { id: 2, title: "Draft one", status: "draft" },
    { id: 3, title: "Live two", status: "live" },
  ];
  ran.length = 0;
});

afterEach(async () => {
  await panel?.close();
  panel = undefined;
});

const boot = async (): Promise<PanelTest> => {
  panel = await createPanelTest({ module: AdminModule });
  return panel;
};

describe("a table, driven", () => {
  it("shows the rows a reader would be shown", async () => {
    await (await boot()).resource(PostResource).table().assertCanSeeRecords([1, 2, 3]);
  });

  it("takes a record as the object a test already has", async () => {
    await (await boot()).resource(PostResource).table().assertCanSeeRecords(rows);
  });

  it("says which rows are missing and which are unexpected", async () => {
    // A failure that says only "not equal" sends somebody reading the panel.
    await expect(
      (await boot()).resource(PostResource).table().assertCanSeeRecords([1, 99]),
    ).rejects.toThrow(/Missing: \["99"\].*Unexpected: \["2","3"\]/s);
  });

  it("narrows by a filter the table declared", async () => {
    await (
      await boot()
    )
      .resource(PostResource)
      .table()
      .assertCanSeeRecords([1, 2, 3])
      .filter("status", "live")
      .assertCanSeeRecords([1, 3])
      .assertCannotSeeRecords([2]);
  });

  it("refuses a filter nothing declared rather than asserting on an unfiltered list", async () => {
    // The boundary drops it without a word — correctly — and a test that
    // believed it had filtered would assert against every row and pass.
    await expect(
      (await boot()).resource(PostResource).table().filter("nonsense", "x"),
    ).rejects.toThrow(/applied no filter called "nonsense"/);
  });

  it("reads the total the server states, not the rows it sent", async () => {
    await (await boot()).resource(PostResource).table().assertTotal(3);
  });
});

describe("what a page cost", () => {
  it("is one query for the list, however many rows come back", async () => {
    // The N+1 guardrail: a table that fetched a relation per row would look
    // perfectly correct on screen and cost four.
    await (
      await boot()
    )
      .resource(PostResource)
      .table()
      .assertCanSeeRecords([1, 2, 3])
      .assertQueryCount(1);
  });

  it("counts each further page the chain asks for", async () => {
    await (
      await boot()
    )
      .resource(PostResource)
      .table()
      .filter("status", "live")
      .assertQueryCount(2);
  });

  it("is about this table, not about whatever the test did before it", async () => {
    // An action ran first and went to the database twice. A count that carried
    // those over would make every assertion depend on what came before it in
    // the file.
    const booted = await boot();
    await booted.resource(PostResource).action("archive", 1).call();

    await booted.resource(PostResource).table().assertQueryCount(1);
  });

  it("says what a count that is wrong means", async () => {
    await expect(
      (await boot()).resource(PostResource).table().assertQueryCount(9),
    ).rejects.toThrow(/cost 9 queries, and it cost 1.*one row at a time/s);
  });
});

describe("an action", () => {
  it("is offered where the table offers it", async () => {
    await (await boot()).resource(PostResource).action("archive", 1).assertVisible();
  });

  it("is still offered where only a policy stands between it and the reader", async () => {
    // Which is the panel being right: a hidden button was never the
    // protection, so `authorize` refuses the run rather than removing the
    // control. A helper that read "offered" as "permitted" would say this
    // action can be carried out.
    await (await boot()).resource(PostResource).action("purge", 1).assertVisible();
  });

  it("is not offered where nothing declared it", async () => {
    await (await boot()).resource(PostResource).action("nonsense", 1).assertHidden();
  });

  it("runs against the record it was given, and says what it told the reader", async () => {
    await (
      await boot()
    )
      .resource(PostResource)
      .action("archive", 1)
      .call()
      .assertProcessed(1)
      .assertNotification("success", "Post archived");

    expect(ran).toEqual([1]);
  });

  it("runs against a selection, which is the same route", async () => {
    await (
      await boot()
    )
      .resource(PostResource)
      .action("archive", 1, 3)
      .call()
      .assertProcessed(2);

    expect(ran).toEqual([1, 3]);
  });

  it("is refused on the server whatever the table drew", async () => {
    // The button was never the protection, and a helper that read visibility
    // as permission would say this one cannot happen.
    await (
      await boot()
    )
      .resource(PostResource)
      .action("purge", 1)
      .call()
      .assertProcessed(0)
      .assertRefused(1);
  });

  it("says so where a test expects one nothing declared to be offered", async () => {
    await expect(
      (await boot()).resource(PostResource).action("nonsense", 1).assertVisible(),
    ).rejects.toThrow(/The table offers \["archive","boom","purge"\]/);
  });

  it("says so where what it told the reader is not what a test expected", async () => {
    await expect(
      (await boot())
        .resource(PostResource)
        .action("archive", 1)
        .call()
        .assertNotification("success", "Something else"),
    ).rejects.toThrow(/and it said/);
  });

  it("tells a panel that fell over from a record that was turned down", async () => {
    // Both leave nothing processed. Read as a refusal, an action that raised
    // reads as a guard doing its job.
    await expect(
      (await boot()).resource(PostResource).action("boom", 1).call().assertProcessed(0),
    ).rejects.toThrow(/panel failing rather than the action refusing/);
  });

  it("says so where a test asserts on an action it never called", async () => {
    await expect(
      (await boot()).resource(PostResource).action("archive", 1).assertProcessed(1),
    ).rejects.toThrow(/was never called/);
  });
});
