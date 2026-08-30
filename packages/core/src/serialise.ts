/**
 * Stage 8 — the resolved tree as plain JSON.
 *
 * `ResolvedNode` carries class instances, which cross neither the wire nor the
 * boundary: `@perchjs/ui` gets types from core and nothing else, so the
 * renderer cannot call `instanceof`. It gets a discriminated record instead,
 * which is also what goes on the wire.
 *
 * Invisible nodes are omitted rather than sent with a flag. Hiding on the
 * client is a data leak, and a node the client never receives cannot leak its
 * options, its label or its value.
 */
import type { ColumnSpan } from "./component.js";
import type { LiveConfig } from "./field.js";
import { Field } from "./field.js";
import type { Option } from "./option.js";
import type { FieldErrors, ResolvedNode, ResolveResult } from "./resolve.js";

export interface SchemaNode {
  readonly id: string;
  /** Keys the renderer registry, and survives minification. */
  readonly type: string;
  /** The state path, for a field. Absent on layout. */
  readonly path?: string;
  readonly label?: string;
  readonly helperText?: string;
  /** A word beside the label, and a glyph before it. */
  readonly hint?: string;
  readonly hintIcon?: string;
  /** Attributes that describe the control, and only those. */
  readonly extraAttributes?: Readonly<Record<string, string>>;
  readonly autofocus?: boolean;
  readonly description?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly inlineLabel?: true;
  /** What a `Placeholder` shows, already resolved. */
  readonly content?: string;
  /**
   * What an `Entry` read from the record. On the node rather than in `state`,
   * because `state` is the map a client may write to and stage 5 must judge —
   * and nothing may ever send this one back.
   */
  readonly value?: unknown;
  /** Which of the panel's colours it takes, already chosen. */
  readonly tone?: string;
  /** Where it links to. Built and checked on the server; never the raw value. */
  readonly href?: string;
  /**
   * Absent means the field never triggers a round trip. Present, it carries the
   * debounce set per field type — the client cannot invent it.
   */
  readonly live?: LiveConfig;
  readonly columnSpan?: ColumnSpan;
  readonly options?: readonly Option[];
  /** Per-type extras: flavour, maxLength, columns, and whatever a plugin adds. */
  readonly props?: Readonly<Record<string, unknown>>;
  readonly children?: readonly SchemaNode[];
}

export interface SchemaPayload {
  readonly schema: SchemaNode;
  readonly state: Readonly<Record<string, unknown>>;
  readonly errors: FieldErrors;
}

/**
 * Copied verbatim onto `props`, per component type.
 *
 * The components this package ships, listed in one place so one guard can read
 * them all. Anything else declares its own through `Component.sends` — a
 * component nobody here wrote cannot edit this table, and a framework whose
 * extension points only work for the framework has none.
 */
const EXTRA_PROPS: Readonly<Record<string, readonly string[]>> = {
  Tabs: ["persistTab"],
  TextInput: [
    "mask",
    "flavour",
    "minLength",
    "maxLength",
    "step",
    "prefix",
    "suffix",
    "prefixIcon",
    "suffixIcon",
  ],
  Select: ["searchable", "multiple", "preload", "optionsLimit"],
  Radio: ["inline"],
  ToggleButtons: ["inline", "grouped"],
  RichEditor: ["toolbar"],
  MarkdownEditor: ["toolbar", "rows", "maxLength"],
  CheckboxList: ["columns", "bulkToggleable"],
  TagsInput: ["separator", "suggestions"],
  KeyValue: ["keyLabel", "valueLabel"],
  Repeater: ["collapsible", "maxItems"],
  DateTimePicker: ["withTime", "timezone", "minDate", "maxDate"],
  FileUpload: ["maxSize", "acceptedFileTypes"],
  Toggle: ["onIcon", "offIcon", "onColor"],
  TextEntry: [
    "format",
    "timezone",
    "currency",
    "decimals",
    "badge",
    "copyable",
    "limit",
  ],
  Textarea: ["rows", "autosize", "maxLength"],
  Section: ["columns", "collapsible", "collapsed", "icon"],
  Callout: ["columns", "icon", "tone"],
  Fieldset: ["columns", "icon"],
  Text: ["tone"],
  Image: ["alt"],
  Icon: ["tone"],
  Tab: ["columns", "icon"],
  Grid: ["columns"],
  Schema: ["columns"],
};

/**
 * Only static values belong here. Anything that accepts a resolver has to be
 * resolved by the cycle and read off `ResolvedNode` — copying it from the state
 * ships the function's source or nothing at all. A description is one of those,
 * so it rides beside the label rather than in this list.
 */

export function serialise(result: ResolveResult): SchemaPayload {
  // The fallback covers a root the caller hid: the form vanishes rather than
  // rendering half of itself.
  const schema = node(result.root) ?? {
    id: result.root.id,
    type: result.root.component.type,
  };
  const visible = new Set(paths(schema));
  const withheld = new Set(
    result.nodes
      .filter((node) => !readable(node))
      .map((node) => (node.component as Field).name),
  );
  return {
    schema,
    // A pruned field has no value; a hidden one has no node, so it has no value
    // the client can see either.
    state: Object.fromEntries(
      Object.entries(result.state).filter(
        ([path]) => visible.has(path) && !withheld.has(path),
      ),
    ),
    errors: Object.fromEntries(
      Object.entries(result.errors).filter(([path]) => visible.has(path)),
    ),
  };
}

function node(resolved: ResolvedNode): SchemaNode | undefined {
  if (!resolved.visible) return undefined;

  const { component } = resolved;
  const children = resolved.children
    .map(node)
    .filter((child): child is SchemaNode => child !== undefined);

  const extras: Record<string, unknown> = {};
  // What the component says first, the table second. Nothing is ever silently
  // ignored: a type in the table that also declares its own is a type moving
  // out of the table, not one being overruled by it.
  const sending =
    component.sends.length > 0 ? component.sends : (EXTRA_PROPS[component.type] ?? []);
  for (const key of sending) {
    const value = (component.state as unknown as Record<string, unknown>)[key];
    // A resolver would have been evaluated already if it were resolvable here;
    // anything still a function is not part of the wire format.
    if (value === undefined || typeof value === "function") continue;
    extras[key] = value;
  }

  // Resolved rather than declared, so it rides with the extras rather than
  // beside them: one `props` on the wire, not two.
  if (resolved.previewUrl !== undefined) extras["previewUrl"] = resolved.previewUrl;
  if (resolved.createsOption !== undefined) {
    extras["createsOption"] = resolved.createsOption;
  }
  if (resolved.itemLabels !== undefined) extras["itemLabels"] = resolved.itemLabels;

  return {
    id: resolved.id,
    type: component.type,
    ...(component instanceof Field && resolved.path !== ""
      ? { path: resolved.path }
      : {}),
    ...(resolved.label === undefined ? {} : { label: resolved.label }),
    ...(resolved.helperText === undefined ? {} : { helperText: resolved.helperText }),
    ...(resolved.hint === undefined ? {} : { hint: resolved.hint }),
    ...(resolved.hintIcon === undefined ? {} : { hintIcon: resolved.hintIcon }),
    ...(resolved.extraAttributes === undefined
      ? {}
      : { extraAttributes: resolved.extraAttributes }),
    ...(resolved.autofocus === undefined ? {} : { autofocus: resolved.autofocus }),
    ...(resolved.description === undefined
      ? {}
      : { description: resolved.description }),
    ...(resolved.disabled ? { disabled: true } : {}),
    ...(resolved.readOnly ? { readOnly: true } : {}),
    ...(resolved.content === undefined ? {} : { content: resolved.content }),
    ...(resolved.value === undefined ? {} : { value: resolved.value }),
    ...(resolved.tone === undefined ? {} : { tone: resolved.tone }),
    ...(resolved.href === undefined ? {} : { href: resolved.href }),
    ...(resolved.required === true ? { required: true } : {}),
    ...(component instanceof Field && component.state.inlineLabel
      ? { inlineLabel: true as const }
      : {}),
    ...(component instanceof Field && component.state.live !== undefined
      ? { live: component.state.live }
      : {}),
    ...(resolved.placeholder === undefined
      ? {}
      : { placeholder: resolved.placeholder }),
    ...(component.state.columnSpan === undefined
      ? {}
      : { columnSpan: component.state.columnSpan }),
    ...(resolved.options === undefined ? {} : { options: resolved.options }),
    ...(Object.keys(extras).length === 0 ? {} : { props: extras }),
    ...(children.length === 0 ? {} : { children }),
  };
}

/**
 * Paths whose value the client is given.
 *
 * A field it may not set has no use for the value and no business holding it:
 * "hidden" names where a thing is drawn, never who may read it, and a value in
 * `data-payload` is a value in the page source. Nothing is lost by keeping it
 * back — the server re-derives it from the row on every pass.
 *
 * Not the same test as `acceptsClientState`: a disabled field also refuses
 * incoming state, and its value is exactly what the reader has to keep seeing.
 */
function readable(resolved: ResolvedNode): boolean {
  const field = resolved.component;
  return !(field instanceof Field) || field.acceptsClient;
}

function paths(schema: SchemaNode): string[] {
  return [
    ...(schema.path === undefined ? [] : [schema.path]),
    ...(schema.children ?? []).flatMap(paths),
  ];
}
