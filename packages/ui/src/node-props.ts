/**
 * What every registered renderer receives.
 *
 * A component gets props and an `onChange`, and never reaches into the kernel
 * or calls the transport. That is exactly what makes it replaceable by a plugin
 * — a component that knows the transport is not substitutable.
 */
import type { SchemaNode, SchemaPayload } from "@perchjs/core";

/** What the create-option route answers: the row, or why there is not one. */
export type CreatedOption =
  | {
      readonly option: SearchedOption;
      /** The host form, resolved by the server with the new option chosen. */
      readonly payload: SchemaPayload;
      readonly errors?: undefined;
    }
  | {
      readonly errors: Readonly<Record<string, string>>;
      readonly payload: SchemaPayload;
      readonly option?: undefined;
    };

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
  /** Right-aligned annotation: a price, a duration, a code. */
  readonly meta?: string;
  /** The server saying it will not take this one, whoever asked for it. */
  readonly disabled?: boolean;
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
   * Asks for the dialog a select opens to make the option it is missing, and
   * sends it back filled in.
   *
   * Two capabilities rather than one, because they are two moments: the schema
   * is resolved when the dialog opens, against this reader and this form, and
   * the write happens when they press the button. Absent where the host cannot
   * ask — the select then draws no way to create, which is the truth.
   *
   * `createOption` answers either with the option that now exists or with the
   * messages that stopped it, the same shape a form save answers with.
   */
  readonly optionForm?:
    | ((path: string, data: Record<string, unknown>) => Promise<SchemaPayload>)
    | undefined;
  readonly createOption?:
    | ((path: string, data: Record<string, unknown>) => Promise<CreatedOption>)
    | undefined;
  /**
   * The value at any path, for the few nodes whose own value is not enough.
   *
   * A repeater has to know whether a row has anything in it — the server will
   * not write one that has not — and that lives under its children's paths. A
   * function rather than the state itself: a node reads what it names, and one
   * that names nothing reads nothing.
   */
  readonly valueAt: (path: string) => unknown;
  /**
   * The message at any path, for the same few nodes.
   *
   * A repeater folds its rows away, and a folded row hiding a field the server
   * refused is a form that will not save with nothing on screen to say why.
   */
  readonly errorAt: (path: string) => string | undefined;
  /** Renders a child node. Passed down so no component imports the renderer. */
  readonly renderChild: (child: SchemaNode) => React.ReactNode;
}
