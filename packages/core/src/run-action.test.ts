import { describe, expect, it } from "vitest";
import { Action } from "./action.js";
import type { ActionState } from "./action.js";
import type { Row } from "./data-adapter.js";
import { Notification } from "./notification.js";
import { admittedRecords, runAction } from "./run-action.js";

class TestAction extends Action {
  static make(): TestAction {
    return new TestAction({});
  }
  override get type(): string {
    return "TestAction";
  }
  protected override with(state: ActionState): this {
    return new TestAction(state) as this;
  }
}

const ROWS: readonly Row[] = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("running one callback over many records", () => {
  it("calls it once per record, in the order they were given", async () => {
    const seen: unknown[] = [];
    const action = TestAction.make().action((record) => {
      seen.push(record["id"]);
    });

    const outcome = await runAction({ action, records: ROWS, user: null });

    expect(seen).toEqual([1, 2, 3]);
    expect(outcome).toEqual({ processed: 3, refused: 0 });
  });

  it("waits for each one, so a slow record does not overlap the next", async () => {
    // Sequential rather than `Promise.all`: they share a transaction, and an
    // adapter handed a connection is not promised to take two statements at
    // once on it.
    const order: string[] = [];
    const action = TestAction.make().action(async (record) => {
      order.push(`start ${String(record["id"])}`);
      await Promise.resolve();
      order.push(`end ${String(record["id"])}`);
    });

    await runAction({ action, records: ROWS.slice(0, 2), user: null });

    expect(order).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("does nothing at all for an action with no callback", async () => {
    expect(
      await runAction({ action: TestAction.make(), records: ROWS, user: null }),
    ).toEqual({ processed: 0, refused: 0 });
  });

  it("hands the callback an object even when no data was given", async () => {
    let handed: unknown;
    const action = TestAction.make().action((_record, data) => {
      handed = data;
    });

    await runAction({ action, records: [ROWS[0] as Row], user: null });

    expect(handed).toEqual({});
  });
});

describe("a guard that turns some records down", () => {
  const admits = (ids: readonly number[]) =>
    TestAction.make().authorize((_user, record) =>
      ids.includes(record["id"] as number),
    );

  it("stops that record and not the batch, and both counts say so", async () => {
    const seen: unknown[] = [];
    const action = admits([1, 3]).action((record) => {
      seen.push(record["id"]);
    });

    expect(await runAction({ action, records: ROWS, user: null })).toEqual({
      processed: 2,
      refused: 1,
    });
    expect(seen).toEqual([1, 3]);
  });

  it("is asked with the principal it was given", async () => {
    const asked: unknown[] = [];
    const action = TestAction.make()
      .authorize((user) => {
        asked.push(user);
        return true;
      })
      .action(() => undefined);

    await runAction({ action, records: ROWS.slice(0, 2), user: { id: "ada" } });

    expect(asked).toEqual([{ id: "ada" }, { id: "ada" }]);
  });

  it("never says why, because the count is all a caller is owed", async () => {
    const outcome = await runAction({ action: admits([]), records: ROWS, user: null });

    expect(Object.keys(outcome)).toEqual(["processed", "refused"]);
    expect(outcome.refused).toBe(3);
  });
});

describe("what the reader is shown", () => {
  it("is what the action said, when it said anything", async () => {
    const action = TestAction.make().action(() =>
      Notification.make().title("Archived").success(),
    );

    const outcome = await runAction({ action, records: [ROWS[0] as Row], user: null });

    expect(outcome.notification).toEqual({ title: "Archived", tone: "success" });
  });

  it("is absent when it said nothing, rather than an empty one", async () => {
    const action = TestAction.make().action(() => undefined);

    expect(await runAction({ action, records: ROWS, user: null })).not.toHaveProperty(
      "notification",
    );
  });

  it("is the last one that spoke, not the first", async () => {
    // Fifty records answering fifty times is a stack nobody reads; keeping the
    // first would hide the one that reported a problem behind the rest.
    const action = TestAction.make().action((record) =>
      Notification.make().title(`row ${String(record["id"])}`),
    );

    const outcome = await runAction({ action, records: ROWS, user: null });

    expect(outcome.notification?.title).toBe("row 3");
  });

  it("survives a record that answered nothing after one that did", async () => {
    const action = TestAction.make().action((record) =>
      record["id"] === 1 ? Notification.make().title("spoke") : undefined,
    );

    const outcome = await runAction({ action, records: ROWS, user: null });

    expect(outcome.notification?.title).toBe("spoke");
  });
});

describe("which records a ready-made action may touch", () => {
  it("is all of them when nothing guards it", async () => {
    expect(await admittedRecords(TestAction.make(), ROWS, null)).toEqual(ROWS);
  });

  it("is exactly what the guard admits, asked one row at a time", async () => {
    const action = TestAction.make().authorize((_user, record) => record["id"] !== 2);

    expect(await admittedRecords(action, ROWS, null)).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("runs no callback while it asks", async () => {
    let called = false;
    const action = TestAction.make()
      .authorize(() => true)
      .action(() => {
        called = true;
      });

    await admittedRecords(action, ROWS, null);

    expect(called).toBe(false);
  });
});
