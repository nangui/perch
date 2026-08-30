/**
 * `TransportClient` — reconciliation and ordering.
 *
 * The bug that makes a Livewire clone feel broken, and nobody plans for it: a
 * patch triggered by field A comes back while the user is typing in field B,
 * and overwrites B. Three mechanisms answer it — dirty paths, an authoritative
 * exception, and a single-flight queue with sequence numbers — and they are the
 * whole of this file.
 *
 * No React, no fetch. Time and I/O are injected, so the ordering rules can be
 * tested without waiting and without a server.
 */
import type { FieldErrors, SchemaPayload } from "@perchjs/core";

export interface StateRequest {
  readonly state: Readonly<Record<string, unknown>>;
  readonly dirtyPath: string;
  readonly sequence: number;
}

export interface StateResponse {
  readonly payload: SchemaPayload;
  /**
   * Paths the server insists on, dirty or not — a computed total, say. This is
   * the authoritative exception; everything else yields to what the user has
   * typed since.
   */
  readonly authoritative?: readonly string[];
}

export interface SaveRequest {
  readonly state: Readonly<Record<string, unknown>>;
}

export interface SaveResponse {
  /** Present when nothing was written. */
  readonly errors?: FieldErrors;
  /** The tree the errors belong to, so they land on the right fields. */
  readonly payload?: SchemaPayload;
  readonly record?: unknown;
  /** Where the server says to go now. It owns the routes; the client does not. */
  readonly redirect?: string;
  /**
   * What to tell the reader, worded by the server.
   *
   * It has to outlive the redirect above, which is the client's to carry — the
   * navigation is its own, and the message is already in its hands.
   */
  readonly notification?: {
    readonly title: string;
    readonly body?: string;
    readonly tone: "success" | "warning" | "danger" | "info";
  };
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
  /** Of those, the ones a request is carrying right now. */
  readonly inFlight: ReadonlySet<string>;
  /** Paths the server overrode while the user was editing them. */
  readonly overridden: ReadonlySet<string>;
  readonly failure?: TransportFailure;
  /** A submission is in flight; the form should not accept a second one. */
  readonly submitting: boolean;
  /** The last submission was written. Cleared by the next edit. */
  readonly saved: boolean;
}

export interface TransportOptions {
  readonly initial: SchemaPayload;
  readonly send: (request: StateRequest) => Promise<StateResponse>;
  /** Absent means the form cannot be submitted — a view, or a page still wiring. */
  readonly save?: (request: SaveRequest) => Promise<SaveResponse>;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  /** Called once the server confirms a write, with everything it returned. */
  readonly onSaved?: (response: SaveResponse) => void;
  /** Injected so tests do not wait in real time. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
  /**
   * How long a request may stay in flight before it is abandoned. Without it a
   * request that never answers blocks every later change behind it, with no
   * failure to show and no retry to offer — a silent loss, which is forbidden.
   * It is also what makes the sequence guard reachable: only an abandoned
   * request can have a response arrive after a newer one.
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
  #submitting = false;
  #saved = false;
  /** Paths the user has touched, and whether a submission was ever refused. */
  #touched = new Set<string>();
  #submitted = false;
  /** Paths whose value on screen is one the server has actually judged. */
  #seen = new Set<string>();
  #disposed = false;

  readonly #send: TransportOptions["send"];
  readonly #save: TransportOptions["save"];
  readonly #onSaved: TransportOptions["onSaved"];
  readonly #onSnapshot: TransportOptions["onSnapshot"];
  readonly #schedule: NonNullable<TransportOptions["schedule"]>;
  readonly #timeout: number;

  constructor(options: TransportOptions) {
    this.#canonical = options.initial;
    this.#send = options.send;
    this.#save = options.save;
    this.#onSaved = options.onSaved;
    this.#onSnapshot = options.onSnapshot;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * A local edit. Optimistic on the draft zone only: the value appears at once,
   * visibility and options never do.
   *
   * `live` is the field's own, and absent means the field triggers no round
   * trip — the edit stays in the draft until the form is submitted. Passing a
   * debounce of 0 for that case would send on every keystroke, which is the
   * opposite of what a field without `live` asks for.
   */
  change(path: string, value: unknown, live?: { readonly debounce: number }): void {
    if (this.#disposed) return;
    this.#draft.set(path, value);
    this.#touched.add(path);
    // Whatever the server said about this field was about the old value.
    this.#seen.delete(path);
    this.#overridden.delete(path);
    this.#saved = false;
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
  /**
   * Submit the form. The whole state goes, canonical and draft together: the
   * server decides what may be written, and a client that sent only what it
   * thought had changed would be deciding for it.
   *
   * One at a time. A second click while the first is in flight would write
   * twice, and the second write would be the one that lands.
   */
  submit(): void {
    if (this.#disposed || this.#submitting || this.#save === undefined) return;
    // Already written, and nothing typed since. On a create that second write
    // is a second row; any edit clears `saved` and unblocks it again.
    if (this.#saved && this.#draft.size === 0) return;

    const save = this.#save;
    const sent = new Map(this.#draft);
    this.#submitting = true;
    this.#submitted = true;
    this.#saved = false;
    this.#failure = undefined;
    this.#emit();

    void save({ state: this.snapshot().payload.state }).then(
      (response) => {
        this.#finish(() => {
          if (
            response.errors !== undefined &&
            Object.keys(response.errors).length > 0
          ) {
            // Nothing was written, so the edits stay exactly where they are.
            // Only the tree is replaced, which is what carries the errors.
            if (response.payload !== undefined) this.#canonical = response.payload;
            // The server judged exactly what was on screen, so every error it
            // reports is about a value the user can still see.
            this.#markSeen(new Map(this.#draft));
            return;
          }
          // Written. What the user typed is canonical now — promoted rather
          // than dropped, or the fields would snap back to what the server last
          // said while the row on disk says otherwise.
          this.#canonical = {
            ...this.#canonical,
            state: { ...this.#canonical.state, ...Object.fromEntries(sent) },
            errors: {},
          };
          for (const path of sent.keys()) this.#draft.delete(path);
          this.#saved = true;
          this.#onSaved?.(response);
        });
      },
      (error: unknown) => {
        this.#finish(() => {
          this.#failure = { kind: "network", error };
        });
      },
    );
  }

  #finish(apply: () => void): void {
    if (this.#disposed) return;
    this.#submitting = false;
    apply();
    this.#emit();
  }

  dispose(): void {
    this.#disposed = true;
    this.#cancelTimer?.();
    this.#cancelTimer = null;
    this.#cancelTimeout?.();
    this.#cancelTimeout = null;
  }

  /** Retries the last failure. Never a silent loss. */
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
        errors: this.#visibleErrors(),
      },
      pending: new Set(this.#draft.keys()),
      inFlight: new Set(this.#inFlight?.sent.keys() ?? []),
      overridden: new Set(this.#overridden),
      submitting: this.#submitting,
      saved: this.#saved,
      ...(this.#failure === undefined ? {} : { failure: this.#failure }),
    };
  }

  /**
   * A form that has never been filled in is not wrong yet. The server sends
   * every error it finds — an empty required field is one from the first render
   * — and showing them before the user has said anything is scolding somebody
   * for what they have not done. So a field's error waits until it is touched,
   * and a refused submission shows all of them at once.
   */
  #visibleErrors(): Readonly<Record<string, string>> {
    return Object.fromEntries(
      Object.entries(this.#canonical.errors).filter(
        ([path]) =>
          this.#seen.has(path) && (this.#submitted || this.#touched.has(path)),
      ),
    );
  }

  /**
   * The server judged the state it was sent. A path still holds that value
   * unless the user has typed since, which `change` records by forgetting it.
   */
  #markSeen(sent: ReadonlyMap<string, unknown>): void {
    for (const path of Object.keys(this.#canonical.state)) {
      if (!this.#draft.has(path) || this.#draft.get(path) === sent.get(path)) {
        this.#seen.add(path);
      }
    }
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

  /**
   * A payload the server produced outside the patch cycle.
   *
   * One thing produces these: a dialog that created a row and had the form
   * resolved again with it chosen. It is not a response to anything this sent,
   * so there is no sequence to settle and nothing to mark seen — but it is the
   * server's own word about the whole form, so it replaces what the server last
   * said. Drafts stay on top of it, because they are still the reader's.
   */
  adopt(payload: SchemaPayload): void {
    if (this.#disposed) return;
    this.#failure = undefined;
    this.#canonical = payload;
    this.#emit();
  }

  #reconcile(response: StateResponse, sent: ReadonlyMap<string, unknown>): void {
    this.#failure = undefined;
    this.#canonical = response.payload;
    this.#markSeen(sent);
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
