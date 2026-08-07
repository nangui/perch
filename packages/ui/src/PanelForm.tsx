/**
 * `PanelForm` — the seam between the transport and the renderer.
 *
 * It owns one `TransportClient`, subscribes to its snapshots and hands them to
 * `SchemaRenderer`. That is the whole of A1 on the client: a keystroke, the
 * debounce the field declared, one request, reconciliation, a re-render.
 *
 * The debounce is read off the node rather than chosen here. ARCH 13 §5 sets it
 * per field type, and a field with no `live` triggers nothing at all — it is
 * submitted with the form instead.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "./SchemaRenderer.js";
import type { Snapshot, StateRequest, StateResponse } from "./transport.js";
import { TransportClient } from "./transport.js";

export interface PanelFormProps {
  readonly initial: SchemaPayload;
  readonly send: (request: StateRequest) => Promise<StateResponse>;
  /** Rendered above the form when a request failed. ARCH 13 §5: never silent. */
  readonly renderFailure?: (snapshot: Snapshot, retry: () => void) => ReactNode;
  readonly timeout?: number;
}

export function PanelForm({
  initial,
  send,
  renderFailure,
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

  const pending = useMemo(() => new Set(snapshot.pending), [snapshot.pending]);

  return (
    <>
      {snapshot.failure === undefined ? null : renderFailure?.(snapshot, retry)}
      <SchemaRenderer
        payload={snapshot.payload}
        onChange={onChange}
        pending={pending}
      />
    </>
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
function createStore(options: {
  initial: SchemaPayload;
  send: PanelFormProps["send"];
  timeout?: number;
}): Store {
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
