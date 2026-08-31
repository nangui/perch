/**
 * The three reconciliation mechanisms, and the ordering rules.
 */
import { describe, expect, it, vi } from "vitest";
import type { SchemaPayload } from "@perchjs/core";
import type { StateRequest, StateResponse, Snapshot } from "./transport.js";
import { TransportClient } from "./transport.js";

const INITIAL: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [
      { id: "a", type: "TextInput", path: "a" },
      { id: "b", type: "TextInput", path: "b" },
      { id: "total", type: "TextInput", path: "total" },
    ],
  },
  state: { a: "", b: "", total: 0 },
  errors: {},
};

function payload(state: Record<string, unknown>): SchemaPayload {
  return { ...INITIAL, state: { ...INITIAL.state, ...state } };
}

/** Timers under the test's control, so ordering is deterministic. */
function harness(send: (request: StateRequest) => Promise<StateResponse>): {
  client: TransportClient;
  snapshots: Snapshot[];
  run: () => void;
} {
  const timers: (() => void)[] = [];
  const snapshots: Snapshot[] = [];
  const client = new TransportClient({
    initial: INITIAL,
    send,
    onSnapshot: (s) => snapshots.push(s),
    schedule: (fn) => {
      timers.push(fn);
      return () => {
        const i = timers.indexOf(fn);
        if (i >= 0) timers.splice(i, 1);
      };
    },
  });
  return {
    client,
    snapshots,
    run: () => {
      const due = [...timers];
      timers.length = 0;
      for (const fn of due) fn();
    },
  };
}

describe("optimism is confined to the draft zone", () => {
  it("shows the typed value at once, before any request", () => {
    const { client } = harness(() => Promise.resolve({ payload: INITIAL }));
    client.change("a", "typed", { debounce: 400 });
    expect(client.snapshot().payload.state["a"]).toBe("typed");
    expect(client.snapshot().pending.has("a")).toBe(true);
  });

  it("does not send anything until the debounce elapses", () => {
    const send = vi.fn(() => Promise.resolve({ payload: INITIAL }));
    const { client } = harness(send);
    client.change("a", "t", { debounce: 400 });
    client.change("a", "ty", { debounce: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends immediately when the field commits at 0 ms", () => {
    const send = vi.fn(() => Promise.resolve({ payload: INITIAL }));
    const { client } = harness(send);
    client.change("a", "fr", { debounce: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("single flight and coalescing", () => {
  it("keeps one request in flight and merges what arrives during it", async () => {
    const requests: StateRequest[] = [];
    let release!: (r: StateResponse) => void;
    const { client, run } = harness((request) => {
      requests.push(request);
      return new Promise<StateResponse>((resolve) => {
        release = resolve;
      });
    });

    client.change("a", "1", { debounce: 0 });
    expect(requests).toHaveLength(1);

    // Three more edits while the first is still in flight.
    client.change("b", "x", { debounce: 0 });
    client.change("b", "xy", { debounce: 0 });
    client.change("b", "xyz", { debounce: 0 });
    expect(requests).toHaveLength(1);

    release({ payload: payload({ a: "1" }) });
    await Promise.resolve();
    await Promise.resolve();
    run();

    // One follow-up carrying the merged state, not three stacked requests.
    expect(requests).toHaveLength(2);
    expect(requests[1]?.state).toMatchObject({ a: "1", b: "xyz" });
  });
});

describe("a request that never answers", () => {
  it("is abandoned rather than blocking every later change", () => {
    // Without this the client waits forever: no failure to show, no retry to
    // offer, and every edit queues behind a request that will never settle.
    const { client, run } = harness(() => new Promise<StateResponse>(() => undefined));

    client.change("a", "typed", { debounce: 0 });
    expect(client.snapshot().failure).toBeUndefined();

    run(); // the timeout fires
    expect(client.snapshot().failure).toEqual({ kind: "timeout", after: 10_000 });
    expect(client.snapshot().payload.state["a"]).toBe("typed");
  });

  it("throws away the late answer once a newer request exists", async () => {
    // The only way two responses can race under single flight, and therefore
    // the only case in which the sequence guard is reachable at all.
    const resolvers: ((r: StateResponse) => void)[] = [];
    const { client, run } = harness(
      () =>
        new Promise<StateResponse>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    client.change("a", "first", { debounce: 0 });
    run(); // abandon request 1
    client.retry(); // request 2
    expect(resolvers).toHaveLength(2);

    // Request 1 finally answers, claiming an older truth.
    resolvers[0]?.({ payload: payload({ a: "STALE" }) });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.snapshot().payload.state["a"]).toBe("first");

    resolvers[1]?.({ payload: payload({ a: "first" }) });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.snapshot().pending.has("a")).toBe(false);
  });
});

describe("a patch never overwrites a dirty path", () => {
  it("keeps what the user typed in B while A's patch was in flight", async () => {
    let release!: (r: StateResponse) => void;
    const { client } = harness(
      () =>
        new Promise<StateResponse>((resolve) => {
          release = resolve;
        }),
    );

    client.change("a", "fr", { debounce: 0 });
    client.change("b", "typing", { debounce: 400 }); // still local, never sent
    release({ payload: payload({ a: "fr", b: "SERVER" }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(client.snapshot().payload.state["b"]).toBe("typing");
  });

  it("keeps a value the user changed again after the request left", async () => {
    let release!: (r: StateResponse) => void;
    const { client } = harness(
      () =>
        new Promise<StateResponse>((resolve) => {
          release = resolve;
        }),
    );

    client.change("a", "one", { debounce: 0 });
    client.change("a", "two", { debounce: 400 }); // typed again mid-flight
    release({ payload: payload({ a: "one" }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(client.snapshot().payload.state["a"]).toBe("two");
    expect(client.snapshot().pending.has("a")).toBe(true);
  });

  it("clears the draft once the server confirms the same value", async () => {
    let release!: (r: StateResponse) => void;
    const { client } = harness(
      () =>
        new Promise<StateResponse>((resolve) => {
          release = resolve;
        }),
    );

    client.change("a", "fr", { debounce: 0 });
    release({ payload: payload({ a: "fr" }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(client.snapshot().pending.has("a")).toBe(false);
  });
});

describe("the authoritative exception", () => {
  it("overwrites a dirty path and flags it for the renderer", async () => {
    let release!: (r: StateResponse) => void;
    const { client } = harness(
      () =>
        new Promise<StateResponse>((resolve) => {
          release = resolve;
        }),
    );

    client.change("a", "10", { debounce: 0 });
    client.change("total", "999", { debounce: 400 }); // the user is editing a computed field
    release({ payload: payload({ a: "10", total: 20 }), authoritative: ["total"] });
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = client.snapshot();
    expect(snapshot.payload.state["total"]).toBe(20);
    // The renderer needs to signal the change, so it has to be told.
    expect(snapshot.overridden.has("total")).toBe(true);
  });
});

describe("failure is surfaced, never swallowed", () => {
  it("reports a network failure and keeps the local edit", async () => {
    let reject!: (e: unknown) => void;
    const { client } = harness(
      () =>
        new Promise<StateResponse>((_, r) => {
          reject = r;
        }),
    );

    client.change("a", "typed", { debounce: 0 });
    reject(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = client.snapshot();
    expect(snapshot.failure?.kind).toBe("network");
    expect(snapshot.payload.state["a"]).toBe("typed");
    expect(snapshot.pending.has("a")).toBe(true);
  });

  it("retries what failed rather than losing it", async () => {
    let attempt = 0;
    let reject!: (e: unknown) => void;
    const { client } = harness(() => {
      attempt += 1;
      if (attempt === 1) {
        return new Promise<StateResponse>((_, r) => {
          reject = r;
        });
      }
      return Promise.resolve({ payload: payload({ a: "typed" }) });
    });

    client.change("a", "typed", { debounce: 0 });
    reject(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();

    client.retry();
    await Promise.resolve();
    await Promise.resolve();

    expect(attempt).toBe(2);
    expect(client.snapshot().failure).toBeUndefined();
    expect(client.snapshot().pending.has("a")).toBe(false);
  });
});

describe("a field that is not live sends nothing", () => {
  it("records the edit and issues no request", () => {
    const send = vi.fn(() => Promise.resolve({ payload: INITIAL }));
    const { client } = harness(send);

    client.change("a", "typed");

    expect(send).not.toHaveBeenCalled();
    expect(client.snapshot().payload.state["a"]).toBe("typed");
    expect(client.snapshot().pending.has("a")).toBe(true);
  });
});

/**
 * A payload that answers nothing.
 *
 * One thing produces these: a dialog that created a row in another table and
 * had the whole form resolved again with it chosen. There is no sequence to
 * settle and nothing to mark as seen — but it is the server's own word about
 * the form, so it replaces what the server last said, and what the reader has
 * typed since stays on top of it.
 */
describe("a payload from outside the patch cycle", () => {
  it("replaces what the server last said", () => {
    const { client } = harness(() => Promise.reject(new Error("not asked")));

    client.adopt(payload({ a: "chosen" }));

    expect(client.snapshot().payload.state["a"]).toBe("chosen");
  });

  it("does not throw away what the reader has typed since", () => {
    // The dialog was open while they were typing in the form behind it. A
    // create that wiped that would cost them more than it saved.
    const { client } = harness(() => Promise.reject(new Error("not asked")));
    client.change("b", "half a sentence");

    client.adopt(payload({ a: "chosen", b: "" }));

    expect(client.snapshot().payload.state["b"]).toBe("half a sentence");
    expect(client.snapshot().payload.state["a"]).toBe("chosen");
  });

  it("clears a failure, because the server has just answered", () => {
    const { client } = harness(() => Promise.reject(new Error("not asked")));
    client.adopt(payload({ a: "chosen" }));

    expect(client.snapshot().failure).toBeUndefined();
  });

  it("is ignored once the form is gone", () => {
    const { client } = harness(() => Promise.reject(new Error("not asked")));
    client.dispose();

    client.adopt(payload({ a: "chosen" }));

    expect(client.snapshot().payload.state["a"]).toBe("");
  });
});

/**
 * A payload adopted while a patch is still in flight.
 *
 * `adopt` is outside the sequence machinery: it answers nothing, so there is no
 * number to settle and no request to mark seen. The question that leaves open
 * is what happens when the answer to a patch sent *before* it arrives *after*
 * it — resolved against a database that did not yet hold the row the dialog
 * created. If that answer replaced what was adopted, the create would undo
 * itself for no reason a reader could see, and only sometimes.
 */
describe("adopt against an answer still on its way", () => {
  it("is not undone by a patch resolved before it happened", async () => {
    let answer: ((r: StateResponse) => void) | undefined;
    const { client } = harness(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    // A live field goes out and does not come back yet. No timers are run:
    // at a debounce of zero the request has already left, and firing them
    // would trip the timeout instead — which abandons the sequence and drops
    // the answer, so the test would pass without the answer ever arriving.
    client.change("a", "typed", { debounce: 0 });

    // Meanwhile a dialog creates a row and hands back the whole form.
    client.adopt(payload({ a: "typed", total: 4 }));
    expect(client.snapshot().payload.state["total"]).toBe(4);

    // The late answer, resolved before that row existed.
    answer?.({ payload: payload({ a: "typed", total: 0 }) });

    // A real turn of the loop, not one microtask: the transport settles a
    // response through a chain of them, and asserting too early reads the
    // state from before it arrived — which passes, and means nothing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.snapshot().payload.state["total"]).toBe(4);
  });

  it("still lets a later patch through, which is not the same thing", async () => {
    // The guard must not freeze the form: what came after the adoption is
    // newer than it, and refusing that would be the opposite mistake.
    let answer: ((r: StateResponse) => void) | undefined;
    const { client } = harness(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    client.adopt(payload({ total: 4 }));
    client.change("a", "typed", { debounce: 0 });
    answer?.({ payload: payload({ a: "typed", total: 9 }) });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.snapshot().payload.state["total"]).toBe(9);
  });
});
