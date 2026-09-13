/**
 * `SchemaRenderer`. Walks the tree the server resolved and hands each node to
 * whatever the registry holds for its `type`.
 *
 * An unknown type shows a marker rather than nothing: a component the client
 * does not know must not wipe out the page. The marker is loud in development
 * and quiet in production, because in production the panel still has to be
 * usable around the gap.
 */
import type { CSSProperties, ReactNode } from "react";
import { memo, useCallback } from "react";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import type { NodeProps } from "./node-props.js";
import { lookupComponent } from "./registry.js";

export interface SchemaRendererProps {
  readonly payload: SchemaPayload;
  readonly onChange: (path: string, value: unknown) => void;
  /** Paths with a patch in flight, so a field can show it. */
  readonly pending?: ReadonlySet<string>;
  readonly inFlight?: ReadonlySet<string>;
  /** Threaded down to whichever field declares itself searchable. */
  readonly searchOptions?: NodeProps["searchOptions"];
  readonly optionForm?: NodeProps["optionForm"];
  readonly createOption?: NodeProps["createOption"];
  readonly uploadFile?: NodeProps["uploadFile"];
}

export function SchemaRenderer({
  payload,
  onChange,
  pending,
  inFlight,
  searchOptions,
  optionForm,
  createOption,
  uploadFile,
}: SchemaRendererProps): ReactNode {
  /**
   * Stable while its inputs are, or `memo` below compares a fresh closure every
   * time and never holds. `pending` is the caller's Set: rebuilding it on each
   * render defeats this from the outside, which is why it is a Set and not a
   * literal in the props.
   */
  // Memoised for the same reason `render` is: a fresh function on every render
  // is a changed prop on every node, and the memoisation below stops holding.
  const valueAt = useCallback((at: string): unknown => payload.state[at], [payload]);
  const errorAt = useCallback(
    (at: string): string | undefined => payload.errors[at],
    [payload],
  );

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
          searchOptions={searchOptions}
          optionForm={optionForm}
          createOption={createOption}
          uploadFile={uploadFile}
          valueAt={valueAt}
          errorAt={errorAt}
          renderChild={renderNode}
        />
      );
    },
    [
      payload,
      onChange,
      pending,
      inFlight,
      searchOptions,
      optionForm,
      createOption,
      uploadFile,
      valueAt,
      errorAt,
    ],
  );

  return render(payload.schema);
}

/**
 * Memoised per node, keyed on `(key, revision)`; the id is that key, and the
 * node object is the revision — the server sends a fresh object only when
 * something about the node changed.
 */
const RenderedNode = memo(function RenderedNode({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  searchOptions,
  optionForm,
  createOption,
  uploadFile,
  valueAt,
  errorAt,
  renderChild,
}: {
  readonly node: SchemaNode;
  readonly value: unknown;
  readonly error?: string | undefined;
  readonly pending?: boolean | undefined;
  readonly inFlight?: boolean | undefined;
  readonly onChange: (path: string, value: unknown) => void;
  readonly searchOptions?: NodeProps["searchOptions"];
  readonly optionForm?: NodeProps["optionForm"];
  readonly createOption?: NodeProps["createOption"];
  readonly uploadFile?: NodeProps["uploadFile"];
  readonly valueAt: NodeProps["valueAt"];
  readonly errorAt: NodeProps["errorAt"];
  readonly renderChild: (child: SchemaNode) => ReactNode;
}): ReactNode {
  const Renderer = lookupComponent(node.type);
  if (Renderer === undefined) return <UnknownNode type={node.type} id={node.id} />;
  return span(
    node,
    <Renderer
      node={node}
      value={value}
      error={error}
      pending={pending}
      inFlight={inFlight}
      onChange={onChange}
      searchOptions={searchOptions}
      optionForm={optionForm}
      createOption={createOption}
      uploadFile={uploadFile}
      valueAt={valueAt}
      errorAt={errorAt}
      renderChild={renderChild}
    />,
  );
});

/**
 * How much of its row a node was told to take.
 *
 * Wrapped rather than handed to every renderer: the grid item is whatever sits
 * directly in the body, and there are thirty renderers that would each have to
 * remember to carry a style they have no other reason to know about. One of
 * them forgetting is a declaration that works on nine fields and not the tenth.
 *
 * Only when it was asked for. A node that said nothing renders exactly what it
 * rendered before, so nothing that already draws gains an element.
 */
function span(node: SchemaNode, drawn: ReactNode): ReactNode {
  const asked = node.columnSpan;
  if (asked === undefined) return drawn;
  return (
    <div
      className="perch-span"
      // `full` is every column there turn out to be, which is not a number the
      // server can know: the grid collapses to one on a narrow screen.
      {...(asked === "full"
        ? { "data-span": "full" }
        : { style: { "--perch-span": String(asked) } as CSSProperties })}
    >
      {drawn}
    </div>
  );
}

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
