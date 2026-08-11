/**
 * `PanelForm` — the seam between the transport and the renderer.
 *
 * It owns one `TransportClient`, subscribes to its snapshots and hands them to
 * `SchemaRenderer`. That is the whole of A1 on the client: a keystroke, the
 * debounce the field declared, one request, reconciliation, a re-render.
 *
 * The debounce is read off the node rather than chosen here. It is set per
 * field type, and a field with no `live` triggers nothing at all — it is
 * submitted with the form instead.
 */
import type { ReactNode, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { FormState, SchemaNode, SchemaPayload } from "@perchjs/core";
import type { SearchedOption } from "./node-props.js";
import { SchemaRenderer } from "./SchemaRenderer.js";
import type {
  SaveRequest,
  SaveResponse,
  Snapshot,
  StateRequest,
  StateResponse,
  TransportOptions,
} from "./transport.js";
import { TransportClient } from "./transport.js";

export interface PanelFormProps {
  readonly initial: SchemaPayload;
  readonly send: (request: StateRequest) => Promise<StateResponse>;
  /** Absent means the form has no submit button: nowhere to write. */
  readonly save?: (request: SaveRequest) => Promise<SaveResponse>;
  readonly onSaved?: (response: SaveResponse) => void;
  readonly submitLabel?: string;
  /** Rendered above the form when a request failed. Never silent. */
  readonly renderFailure?: (snapshot: Snapshot, retry: () => void) => ReactNode;
  /**
   * Asks the server for a searchable field's options. The state travels with
   * it: whether a field is there at all is the resolution's to decide, and it
   * decides from the state.
   */
  readonly searchOptions?: (
    path: string,
    term: string,
    state: FormState,
  ) => Promise<readonly SearchedOption[]>;
  readonly timeout?: number;
}

export function PanelForm({
  initial,
  send,
  save,
  onSaved,
  submitLabel = "Save",
  renderFailure,
  searchOptions,
  timeout,
}: PanelFormProps): ReactNode {
  /**
   * `initial` is read once. Re-creating the client on every change would drop
   * the draft zone, which is the one thing the server cannot restore — so to
   * load another record, remount with a different React `key`, as any form
   * does.
   */
  const store = useRef<Store | null>(null);
  store.current ??= createStore({
    initial,
    send,
    ...(save === undefined ? {} : { save }),
    ...(onSaved === undefined ? {} : { onSaved }),
    ...(timeout === undefined ? {} : { timeout }),
  });
  const { client, subscribe, getSnapshot } = store.current;

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const onChange = useCallback(
    (path: string, value: unknown) => {
      client.change(path, value, liveFor(snapshot.payload.schema, path));
    },
    [client, snapshot.payload.schema],
  );

  // A debounce that outlives its form fires a request nobody is waiting for.
  useEffect(
    () => () => {
      client.dispose();
    },
    [client],
  );

  const retry = useCallback(() => {
    client.retry();
  }, [client]);

  const onSubmit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      // A real form, so Enter submits the way it does everywhere else.
      event.preventDefault();
      client.submit();
    },
    [client],
  );

  // Through a ref, so the callback keeps its identity: handed down as a prop
  // it would otherwise change on every keystroke, and the effect that runs it
  // would re-issue a search each time an unrelated field was edited.
  const state = useRef(snapshot.payload.state);
  state.current = snapshot.payload.state;

  const search = useCallback(
    async (path: string, term: string) =>
      searchOptions === undefined ? [] : await searchOptions(path, term, state.current),
    [searchOptions],
  );

  const pending = useMemo(() => new Set(snapshot.pending), [snapshot.pending]);
  const inFlight = useMemo(() => new Set(snapshot.inFlight), [snapshot.inFlight]);

  return (
    <form onSubmit={onSubmit} noValidate>
      {snapshot.failure === undefined ? null : renderFailure?.(snapshot, retry)}
      <SchemaRenderer
        payload={snapshot.payload}
        onChange={onChange}
        pending={pending}
        inFlight={inFlight}
        {...(searchOptions === undefined ? {} : { searchOptions: search })}
      />
      {save === undefined ? null : (
        <div className="perch-form-actions">
          {/* The label does not change while it is busy: a button that renames
              itself mid-flight is a different button to a screen reader. */}
          <button
            type="submit"
            className="perch-button perch-button--primary"
            disabled={snapshot.submitting}
            aria-busy={snapshot.submitting}
          >
            {submitLabel}
          </button>
          {/* Announced rather than only coloured: a confirmation nobody hears
              is a confirmation only some people get. */}
          <span role="status" className="perch-form-actions__status">
            {snapshot.saved ? "Saved" : ""}
          </span>
        </div>
      )}
    </form>
  );
}

interface Store {
  readonly client: TransportClient;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => Snapshot;
}

/**
 * `useSyncExternalStore` demands a snapshot that is referentially stable between
 * notifications, so the client's latest is cached rather than rebuilt on every
 * read — returning a fresh object each time makes React loop forever.
 */
function createStore(options: Omit<TransportOptions, "onSnapshot">): Store {
  const listeners = new Set<() => void>();
  let current: Snapshot;

  const client = new TransportClient({
    ...options,
    onSnapshot: (snapshot) => {
      current = snapshot;
      for (const listener of listeners) listener();
    },
  });
  current = client.snapshot();

  return {
    client,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
  };
}

/** Undefined for a field that is not live: nothing is sent until submit. */
function liveFor(
  root: SchemaNode,
  path: string,
): { readonly debounce: number } | undefined {
  return find(root, path)?.live;
}

function find(node: SchemaNode, path: string): SchemaNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = find(child, path);
    if (found !== undefined) return found;
  }
  return undefined;
}
