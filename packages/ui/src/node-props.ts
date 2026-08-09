/**
 * What every registered renderer receives.
 *
 * ARCH 13 §2: a component gets props and an `onChange`, and never reaches into
 * the kernel or calls the transport. That is exactly what makes it replaceable
 * by a plugin — a component that knows the transport is not substitutable.
 */
import type { SchemaNode } from "@perchjs/core";

export interface NodeProps {
  readonly node: SchemaNode;
  /** The value at `node.path`, or undefined for a layout node. */
  readonly value: unknown;
  /** Server-side message for this node's path. */
  readonly error?: string | undefined;
  /** True while a patch triggered by this field is in flight. */
  readonly pending?: boolean | undefined;
  /** A request is carrying this value right now, as opposed to merely holding it. */
  readonly inFlight?: boolean | undefined;
  readonly onChange: (path: string, value: unknown) => void;
  /** Renders a child node. Passed down so no component imports the renderer. */
  readonly renderChild: (child: SchemaNode) => React.ReactNode;
}
