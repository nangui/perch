/**
 * What keeps a public demo usable: it goes back to how it started.
 *
 * The data is whatever visitors leave behind until the interval fires, so a
 * demo whose reset quietly stopped is a demo that drifts into whatever the last
 * person typed. Nothing would announce that.
 *
 * `restore()` is counted rather than faked, by a subclass that overrides it, so
 * there is no stand-in for Prisma here at all and nothing to encode a mistake.
 * What is asserted is the scheduling, which is the part that can silently stop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Seed } from "./seed.js";

class Counting extends Seed {
  restored = 0;

  constructor() {
    // The only member the base class holds is the client, and the override
    // below is the one thing that would have reached for it.
    super(undefined as never);
  }

  override restore(): Promise<void> {
    this.restored += 1;
    return Promise.resolve();
  }
}

const MINUTES = "DEMO_RESET_MINUTES";

/** Whatever the machine running this has set, left as it was found. */
const every = (minutes: string | undefined): void => void vi.stubEnv(MINUTES, minutes);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the demo's data", () => {
  it("is put back at boot, before anything is scheduled", async () => {
    every(undefined);
    const seed = new Counting();

    await seed.onApplicationBootstrap();

    expect(seed.restored).toBe(1);
  });

  it("goes back on the hour, which is the default", async () => {
    every(undefined);
    const seed = new Counting();
    await seed.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(seed.restored, "before the hour is up").toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(seed.restored, "on the hour").toBe(2);

    seed.onModuleDestroy();
  });

  it("takes the interval it is given", async () => {
    every("5");
    const seed = new Counting();
    await seed.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(seed.restored).toBe(4);
    seed.onModuleDestroy();
  });

  it("is left alone where the interval is off", async () => {
    // Zero is the documented way to keep what visitors left, and a deployment
    // that wants that would find out it did not work an hour later.
    every("0");
    const seed = new Counting();
    await seed.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

    expect(seed.restored).toBe(1);
  });

  it("stops when the module does", async () => {
    every(undefined);
    const seed = new Counting();
    await seed.onApplicationBootstrap();

    seed.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000);

    expect(seed.restored).toBe(1);
  });
});
