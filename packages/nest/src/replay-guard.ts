/**
 * Recognising a request that has already been carried out.
 *
 * The client will not press twice — a ref holds the second click while the
 * first is in flight — but that guard runs in a browser, and the route is
 * reachable without one. A retried fetch, a proxy that resends, a scripted
 * caller: each can put the same intent on the wire twice, and an action that
 * archives or charges or emails does not want to happen twice.
 *
 * So a request may carry a key it made up, and a key seen before answers with
 * what it answered the first time rather than running again.
 *
 * What this does not do, and cannot: two readers pressing once each are two
 * intentions, not a replay, and no key tells them apart. This catches the same
 * request arriving twice, which is the failure a guard can actually see.
 *
 * Held in memory, so it is one process's memory. That is the deployment v0.1
 * documents; behind two of them a replay can land on the one that has not seen
 * the key. Saying so here is the point — the alternative is a store to run and
 * a port to declare, and neither is worth building before the panel supports
 * the deployment that needs them.
 */

/** Long enough for a retry, short enough that nothing accumulates. */
export const REPLAY_WINDOW_MS = 60_000;

/** Above this the oldest go, so a caller inventing keys cannot grow it forever. */
const MAX_KEPT = 1000;

interface Kept<T> {
  readonly at: number;
  readonly answer: T;
}

export class ReplayGuard<T> {
  readonly #kept = new Map<string, Kept<T>>();
  readonly #window: number;

  constructor(window = REPLAY_WINDOW_MS) {
    this.#window = window;
  }

  /**
   * What that key answered, if it is still within the window.
   *
   * An expired key is forgotten as it is read rather than left for the sweep:
   * whoever is asking is the reason to look at it.
   */
  recall(key: string, now: number): T | undefined {
    const kept = this.#kept.get(key);
    if (kept === undefined) return undefined;
    if (now - kept.at >= this.#window) {
      this.#kept.delete(key);
      return undefined;
    }
    return kept.answer;
  }

  remember(key: string, answer: T, now: number): void {
    this.#sweep(now);
    // Re-inserted rather than updated, so the iteration order below is by age
    // and the oldest really is first.
    this.#kept.delete(key);
    this.#kept.set(key, { at: now, answer });
  }

  /**
   * Swept as things are written rather than on a timer.
   *
   * A timer in a library is a thing the host did not start and cannot stop, and
   * this is small enough not to need one: entries are two fields and they leave
   * within the minute.
   */
  #sweep(now: number): void {
    for (const [key, kept] of this.#kept) {
      if (now - kept.at < this.#window) break;
      this.#kept.delete(key);
    }
    // A caller that invents a key per request would otherwise hold a minute of
    // them. The oldest go first, which is the order the map is already in.
    while (this.#kept.size >= MAX_KEPT) {
      const oldest = this.#kept.keys().next().value;
      if (oldest === undefined) break;
      this.#kept.delete(oldest);
    }
  }

  /** For a test, and for anybody wondering whether it is holding anything. */
  get size(): number {
    return this.#kept.size;
  }
}

/**
 * The key a request offers, or nothing.
 *
 * Bounded and text-only: it is a map key, and a caller does not get to decide
 * how much of the process's memory one entry takes.
 */
export function readReplayKey(body: unknown): string | undefined {
  const raw = (body as { idempotencyKey?: unknown } | null)?.idempotencyKey;
  if (typeof raw !== "string") return undefined;
  if (raw.length === 0 || raw.length > 200) return undefined;
  return raw;
}
