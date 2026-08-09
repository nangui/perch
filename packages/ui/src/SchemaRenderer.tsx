/**
 * `SchemaRenderer` — ARCH 13 §6. Walks the tree the server resolved and hands
 * each node to whatever the registry holds for its `type`.
 *
 * An unknown type shows a marker rather than nothing: PRD 03 §4.1 and §6.7 both
 * ask that a component the client does not know must not wipe out the page. The
 * marker is loud in development and quiet in production, because in production
 * the panel still has to be usable around the gap.
 */
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { lookupComponent } from "./registry.js";

export interface SchemaRendererProps {
  readonly payload: SchemaPayload;
  readonly onChange: (path: string, value: unknown) => void;
  /** Paths with a patch in flight, so a field can show it (ARCH 13 §5). */
  readonly pending?: ReadonlySet<string>;
  readonly inFlight?: ReadonlySet<string>;
}

export function SchemaRenderer({
  payload,
  onChange,
  pending,
  inFlight,
}: SchemaRendererProps): ReactNode {
  /**
   * Stable while its inputs are, or `memo` below compares a fresh closure every
   * time and never holds. `pending` is the caller's Set: rebuilding it on each
   * render defeats this from the outside, which is why it is a Set and not a
   * literal in the props.
   */
  const render = useCallback(
    function renderNode(node: SchemaNode): ReactNode {
      return (
        <RenderedNode
          key={node.id}
          node={node}
          value={node.path === undefined ? undefined : payload.state[node.path]}
          error={node.path === undefined ? undefined : payload.errors[node.path]}
          pending={node.path !== undefined && pending?.has(node.path) === true}
          inFlight={node.path !== undefined && inFlight?.has(node.path) === true}
          onChange={onChange}
          renderChild={renderNode}
        />
      );
    },
    [payload, onChange, pending, inFlight],
  );

  return render(payload.schema);
}

/**
 * Memoised per node. ARCH 13 §6 keys on `(key, revision)`; the id is that key,
 * and the node object is the revision — the server sends a fresh object only
 * when something about the node changed.
 */
const RenderedNode = memo(function RenderedNode({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  renderChild,
}: {
  readonly node: SchemaNode;
  readonly value: unknown;
  readonly error?: string | undefined;
  readonly pending?: boolean | undefined;
  readonly inFlight?: boolean | undefined;
  readonly onChange: (path: string, value: unknown) => void;
  readonly renderChild: (child: SchemaNode) => ReactNode;
}): ReactNode {
  const Renderer = lookupComponent(node.type);
  if (Renderer === undefined) return <UnknownNode type={node.type} id={node.id} />;
  return (
    <Renderer
      node={node}
      value={value}
      error={error}
      pending={pending}
      inFlight={inFlight}
      onChange={onChange}
      renderChild={renderChild}
    />
  );
});

function UnknownNode({ type, id }: { type: string; id: string }): ReactNode {
  if (process.env["NODE_ENV"] === "production") {
    return <span data-perch-unknown={type} hidden />;
  }
  // No live region: this is a message for whoever is building the panel, and
  // announcing it to every screen-reader user would be worse than the gap.
  return (
    <div className="perch-unknown" data-perch-unknown={type}>
      No renderer registered for <code>{type}</code> (node <code>{id}</code>).
    </div>
  );
}
