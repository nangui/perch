/**
 * What every registered renderer receives.
 *
 * A component gets props and an `onChange`, and never reaches into the kernel
 * or calls the transport. That is exactly what makes it replaceable by a plugin
 * — a component that knows the transport is not substitutable.
 */
import type { SchemaNode } from "@perchjs/core";

/** What the upload route answers with. The key is the field's value. */
export interface UploadedFile {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface SearchedOption {
  readonly value: string | number | boolean | null;
  readonly label: string;
}

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
  /**
   * Asks the server for the options of a searchable field.
   *
   * A capability, like `onChange`: the component is handed a function and
   * still knows nothing about the protocol. Absent where the host cannot ask —
   * a searchable field then behaves like one that is not.
   */
  readonly searchOptions?:
    ((path: string, term: string) => Promise<readonly SearchedOption[]>) | undefined;
  /**
   * Sends a file the reader chose, and answers with what was staged.
   *
   * A capability like the others: the component is handed a function and still
   * knows nothing about multipart, or about the route. Absent where the host
   * cannot send — the control then says so rather than accepting a file it
   * would drop.
   */
  readonly uploadFile?:
    ((path: string, file: File) => Promise<UploadedFile>) | undefined;
  /**
   * The value at any path, for the few nodes whose own value is not enough.
   *
   * A repeater has to know whether a row has anything in it — the server will
   * not write one that has not — and that lives under its children's paths. A
   * function rather than the state itself: a node reads what it names, and one
   * that names nothing reads nothing.
   */
  readonly valueAt: (path: string) => unknown;
  /** Renders a child node. Passed down so no component imports the renderer. */
  readonly renderChild: (child: SchemaNode) => React.ReactNode;
}
