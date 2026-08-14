import { describe, expect, it } from "vitest";
import { ReplayGuard, REPLAY_WINDOW_MS, readReplayKey } from "./replay-guard.js";

// Time is an argument here rather than a clock, so a test does not have to wait
// a minute to find out what happens after one.
const T0 = 1_000_000;

describe("a request that arrives twice", () => {
  it("is answered with what it was answered the first time", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "done", T0);

    expect(guard.recall("k", T0 + 1)).toBe("done");
  });

  it("is a different request under a different key", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "done", T0);

    expect(guard.recall("other", T0 + 1)).toBeUndefined();
  });

  it("is nothing at all before anything has been carried out", () => {
    expect(new ReplayGuard<string>().recall("k", T0)).toBeUndefined();
  });
});

describe("the window it is recognised within", () => {
  it("holds for a retry that comes back quickly", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "done", T0);

    expect(guard.recall("k", T0 + REPLAY_WINDOW_MS - 1)).toBe("done");
  });

  it("has let go by the time it closes", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "done", T0);

    expect(guard.recall("k", T0 + REPLAY_WINDOW_MS)).toBeUndefined();
  });

  it("forgets an expired key as it reads it, rather than holding it", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "done", T0);

    guard.recall("k", T0 + REPLAY_WINDOW_MS);

    expect(guard.size).toBe(0);
  });
});

describe("what it holds on to", () => {
  it("drops what has expired as new things arrive", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("old", "done", T0);
    guard.remember("new", "done", T0 + REPLAY_WINDOW_MS);

    expect(guard.size).toBe(1);
    expect(guard.recall("new", T0 + REPLAY_WINDOW_MS)).toBe("done");
  });

  it("stays bounded against a caller inventing a key every time", () => {
    // Every one of these is within the window, so age alone would not stop it.
    const guard = new ReplayGuard<string>();
    for (let i = 0; i < 5000; i += 1) guard.remember(`k${String(i)}`, "done", T0);

    expect(guard.size).toBeLessThanOrEqual(1000);
  });

  it("keeps the newest when it has to choose", () => {
    const guard = new ReplayGuard<string>();
    for (let i = 0; i < 2000; i += 1) guard.remember(`k${String(i)}`, "done", T0);

    expect(guard.recall("k1999", T0)).toBe("done");
    expect(guard.recall("k0", T0)).toBeUndefined();
  });

  it("does not age a key out because it was written again", () => {
    const guard = new ReplayGuard<string>();
    guard.remember("k", "first", T0);
    guard.remember("k", "second", T0 + 100);

    expect(guard.recall("k", T0 + REPLAY_WINDOW_MS - 1)).toBe("second");
    expect(guard.size).toBe(1);
  });
});

describe("the key a request offers", () => {
  it("is taken when it is text", () => {
    expect(readReplayKey({ idempotencyKey: "abc" })).toBe("abc");
  });

  it("is nothing when the request offered none", () => {
    expect(readReplayKey({})).toBeUndefined();
    expect(readReplayKey(null)).toBeUndefined();
    expect(readReplayKey("not an object")).toBeUndefined();
  });

  it("is refused when it is not text, whatever else it is", () => {
    expect(readReplayKey({ idempotencyKey: 42 })).toBeUndefined();
    expect(readReplayKey({ idempotencyKey: { nested: true } })).toBeUndefined();
  });

  it("is refused when it is long enough to be a payload", () => {
    // It becomes a map key held for a minute; how much of the process's memory
    // one entry takes is not the caller's to decide.
    expect(readReplayKey({ idempotencyKey: "x".repeat(201) })).toBeUndefined();
    expect(readReplayKey({ idempotencyKey: "x".repeat(200) })).toHaveLength(200);
  });

  it("is refused when it is empty, which names nothing", () => {
    expect(readReplayKey({ idempotencyKey: "" })).toBeUndefined();
  });
});
