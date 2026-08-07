/**
 * `TransportClient` — ARCH 13 §4 and §5.
 *
 * §4 opens with "this is the bug that makes a Livewire clone feel broken, and
 * nobody plans for it": a patch triggered by field A comes back while the user
 * is typing in field B, and overwrites B. The three mechanisms that document
 * names — dirty paths, an authoritative exception, and a single-flight queue
 * with sequence numbers — are the whole of this file.
 *
 * No React, no fetch. Time and I/O are injected, so the ordering rules can be
 * tested without waiting and without a server.
 */
import type { SchemaPayload } from "@perchjs/core";

export interface StateRequest {
  readonly state: Readonly<Record<string, unknown>>;
  readonly dirtyPath: string;
  readonly sequence: number;
}

export interface StateResponse {
  readonly payload: SchemaPayload;
  /**
   * Paths the server insists on, dirty or not — a computed total, say. ARCH 13
   * §4 calls this the authoritative exception; everything else yields to what
   * the user has typed since.
   */
  readonly authoritative?: readonly string[];
}

export type TransportFailure =
  | { readonly kind: "network"; readonly error: unknown }
  | { readonly kind: "timeout"; readonly after: number }
  | { readonly kind: "server"; readonly status: number; readonly requestId?: string };

export interface Snapshot {
  /** The payload to render: canonical, with unconfirmed local edits on top. */
  readonly payload: SchemaPayload;
  /** Paths with an edit the server has not confirmed. */
  readonly pending: ReadonlySet<string>;
  /** Paths the server overrode while the user was editing them. */
  readonly overridden: ReadonlySet<string>;
  readonly failure?: TransportFailure;
}

export interface TransportOptions {
  readonly initial: SchemaPayload;
  readonly send: (request: StateRequest) => Promise<StateResponse>;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  /** Injected so tests do not wait in real time. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
  /**
   * How long a request may stay in flight before it is abandoned. Without it a
   * request that never answers blocks every later change behind it, with no
   * failure to show and no retry to offer — a silent loss, which ARCH 13 §5
   * forbids. It is also what makes the sequence guard reachable: only an
   * abandoned request can have a response arrive after a newer one.
   */
  readonly timeout?: number;
}

const DEFAULT_TIMEOUT = 10_000;

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => {
    clearTimeout(id);
  };
};

export class TransportClient {
  #canonical: SchemaPayload;
  #draft = new Map<string, unknown>();
  #overridden = new Set<string>();
  #inFlight: { sequence: number; sent: Map<string, unknown> } | null = null;
  #queuedPath: string | null = null;
  #cancelTimer: (() => void) | null = null;
  #sequence = 0;
  #latest = 0;
  #abandoned = new Set<number>();
  #cancelTimeout: (() => void) | null = null;
  #failure: TransportFailure | undefined;
  #disposed = false;

  readonly #send: TransportOptions["send"];
  readonly #onSnapshot: TransportOptions["onSnapshot"];
  readonly #schedule: NonNullable<TransportOptions["schedule"]>;
  readonly #timeout: number;

  constructor(options: TransportOptions) {
    this.#canonical = options.initial;
    this.#send = options.send;
    this.#onSnapshot = options.onSnapshot;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * A local edit. Optimistic on the draft zone only (ARCH 13 §5): the value
   * appears at once, visibility and options never do.
   *
   * `live` is the field's own, and absent means the field triggers no round
   * trip — the edit stays in the draft until the form is submitted. Passing a
   * debounce of 0 for that case would send on every keystroke, which is the
   * opposite of what a field without `live` asks for.
   */
  change(path: string, value: unknown, live?: { readonly debounce: number }): void {
    if (this.#disposed) return;
    this.#draft.set(path, value);
    this.#overridden.delete(path);
    this.#emit();

    if (live === undefined) return;

    this.#cancelTimer?.();
    if (live.debounce <= 0) {
      this.#cancelTimer = null;
      this.#flush(path);
      return;
    }
    this.#cancelTimer = this.#schedule(() => {
      this.#cancelTimer = null;
      this.#flush(path);
    }, live.debounce);
  }

  /**
   * Stops every timer and ignores every response still to come. Without it a
   * debounce outlives the form it belonged to and fires a request nobody is
   * waiting for.
   */
  dispose(): void {
    this.#disposed = true;
    this.#cancelTimer?.();
    this.#cancelTimer = null;
    this.#cancelTimeout?.();
    this.#cancelTimeout = null;
  }

  /** Retries the last failure. ARCH 13 §5: never a silent loss. */
  retry(): void {
    if (this.#failure === undefined) return;
    this.#failure = undefined;
    this.#latest = this.#sequence;
    this.#flush(this.#queuedPath ?? [...this.#draft.keys()][0] ?? "");
  }

  snapshot(): Snapshot {
    return {
      payload: {
        ...this.#canonical,
        state: { ...this.#canonical.state, ...Object.fromEntries(this.#draft) },
      },
      pending: new Set(this.#draft.keys()),
      overridden: new Set(this.#overridden),
      ...(this.#failure === undefined ? {} : { failure: this.#failure }),
    };
  }

  #emit(): void {
    this.#onSnapshot(this.snapshot());
  }

  /**
   * One request in flight per form. A change arriving during the flight is
   * merged into the next one rather than stacked, so a burst of typing produces
   * two requests and not twenty.
   */
  #flush(dirtyPath: string): void {
    if (this.#disposed) return;
    if (this.#inFlight !== null) {
      this.#queuedPath = dirtyPath;
      return;
    }
    if (this.#draft.size === 0) return;

    this.#sequence += 1;
    const sequence = this.#sequence;
    this.#latest = sequence;
    const sent = new Map(this.#draft);
    this.#inFlight = { sequence, sent };

    const request: StateRequest = {
      state: { ...this.#canonical.state, ...Object.fromEntries(sent) },
      dirtyPath,
      sequence,
    };

    this.#cancelTimeout = this.#schedule(() => {
      if (this.#inFlight?.sequence !== sequence) return;
      this.#abandoned.add(sequence);
      this.#inFlight = null;
      this.#cancelTimeout = null;
      this.#failure = { kind: "timeout", after: this.#timeout };
      this.#emit();
    }, this.#timeout);

    void this.#send(request).then(
      (response) => {
        this.#settle(sequence, () => {
          this.#reconcile(response, sent);
        });
      },
      (error: unknown) => {
        this.#settle(sequence, () => {
          this.#failure = { kind: "network", error };
        });
      },
    );
  }

  /** A response for anything but the newest live request is thrown away. */
  #settle(sequence: number, apply: () => void): void {
    if (this.#disposed) return;
    if (sequence !== this.#latest || this.#abandoned.has(sequence)) return;
    this.#cancelTimeout?.();
    this.#cancelTimeout = null;
    this.#inFlight = null;
    apply();
    this.#emit();

    const queued = this.#queuedPath;
    this.#queuedPath = null;
    if (queued !== null) this.#flush(queued);
  }

  #reconcile(response: StateResponse, sent: ReadonlyMap<string, unknown>): void {
    this.#failure = undefined;
    this.#canonical = response.payload;
    const authoritative = new Set(response.authoritative ?? []);

    for (const [path, value] of sent) {
      // Typed again since the request left: the edit is still the user's.
      if (this.#draft.get(path) !== value) continue;
      this.#draft.delete(path);
    }

    // The exception: the server insists, even on a path being edited.
    for (const path of authoritative) {
      if (!this.#draft.has(path)) continue;
      this.#draft.delete(path);
      this.#overridden.add(path);
    }
  }
}
