/**
 * The built-in renderers, registered under the same keys the server sends.
 *
 * Each one adapts a `SchemaNode` to a component that already existed and knows
 * nothing about the protocol. That direction matters: the components stay
 * substitutable, which is what a plugin needs to replace one.
 */
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import type { SchemaNode } from "@perchjs/core";
import { FieldShell } from "./FieldShell.js";
import type { FieldStatus } from "./field-state.js";
import { Select } from "./fields/Select.js";
import { Checkbox } from "./fields/Checkbox.js";
import { DateTimePicker } from "./fields/DateTimePicker.js";
import { FileUpload } from "./fields/FileUpload.js";
import { Placeholder } from "./fields/Placeholder.js";
import type { RepeaterItem } from "./fields/Repeater.js";
import { Repeater } from "./fields/Repeater.js";
import { Radio } from "./fields/Radio.js";
import { Textarea } from "./fields/Textarea.js";
import { Toggle } from "./fields/Toggle.js";
import { MultiSelect } from "./fields/MultiSelect.js";
import { SearchableSelect } from "./fields/SearchableSelect.js";
import { TextInput } from "./fields/TextInput.js";
import { TextEntry } from "./entries/TextEntry.js";
import type { TextFlavour } from "./fields/TextInput.js";
import type { NodeProps } from "./node-props.js";
import { registerComponent } from "./registry.js";

function statusOf(
  node: SchemaNode,
  error?: string,
  pending?: boolean,
  inFlight?: boolean,
): FieldStatus {
  return {
    lifecycle: inFlight === true ? "inFlight" : pending === true ? "draft" : "rest",
    error,
    disabled: node.disabled,
    readOnly: node.readOnly,
  };
}

/** A select value is a scalar on the wire; anything else is not one. */
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * A multiple select holds a list.
 *
 * A scalar becomes a list of one rather than nothing: a field switched to
 * multiple after a row was written holds what it held, and dropping it would
 * lose a value on the next save without saying so.
 */
function list(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return (value as readonly unknown[])
      .map(scalar)
      .filter((held): held is string => held !== null);
  }
  const only = scalar(value);
  return only === null ? [] : [only];
}

/** `columns` reaches the CSS as a variable, so the grid stays in the stylesheet. */
function columnsStyle(node: SchemaNode): Record<string, string> | undefined {
  const columns = node.props?.["columns"];
  if (typeof columns !== "number") return undefined;
  return { "--perch-columns": String(columns) };
}

function LayoutRenderer({ node, renderChild }: NodeProps): ReactNode {
  const collapsible = node.props?.["collapsible"] === true;
  // Where it starts, not where it stays: after that it is the reader's.
  const [folded, setFolded] = useState(node.props?.["collapsed"] === true);
  const title = node.label;

  return (
    <div className={`perch-layout perch-layout--${node.type.toLowerCase()}`}>
      {title === undefined ? null : collapsible ? (
        // The whole heading is the control, because a title beside a small
        // arrow is a target most people aim at and miss.
        <button
          type="button"
          className="perch-layout__title perch-layout__title--folds"
          aria-expanded={!folded}
          aria-controls={`${node.id}-body`}
          onClick={() => {
            setFolded((was) => !was);
          }}
        >
          <span className="perch-layout__caret" aria-hidden="true">
            {folded ? "\u25B8" : "\u25BE"}
          </span>
          {title}
        </button>
      ) : (
        <div className="perch-layout__title">{title}</div>
      )}
      {/* Hidden rather than unmounted: a folded field is still a field, still
          filled in and still saved, and unmounting would lose what is in it. */}
      <div
        id={`${node.id}-body`}
        className="perch-layout__body"
        style={columnsStyle(node)}
        hidden={collapsible && folded}
      >
        {(node.children ?? []).map(renderChild)}
      </div>
    </div>
  );
}

function TextInputRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <TextInput
          value={scalar(value) ?? ""}
          onChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
          flavour={(node.props?.["flavour"] as TextFlavour | undefined) ?? "text"}
          {...(typeof node.props?.["maxLength"] === "number"
            ? { maxLength: node.props["maxLength"] }
            : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

function SelectRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  searchOptions,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const options = (node.options ?? [])
    .map((option) => ({ value: scalar(option.value), label: option.label }))
    .filter(
      (option): option is { value: string; label: string } => option.value !== null,
    );

  const label = node.label ?? node.path ?? "";
  const path = node.path;

  // Stable, or the effect that runs it fires on every render of the form.
  const search = useCallback(
    async (term: string) => {
      if (searchOptions === undefined || path === undefined) return [];
      const answer = await searchOptions(path, term);
      return answer
        .map((option) => ({ value: scalar(option.value), label: option.label }))
        .filter(
          (option): option is { value: string; label: string } => option.value !== null,
        );
    },
    [searchOptions, path],
  );

  // A field the host cannot ask about is not searchable, whatever it declared:
  // a search box that answers nothing is worse than none.
  const searchable = node.props?.["searchable"] === true && searchOptions !== undefined;
  const multiple = node.props?.["multiple"] === true;

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) =>
        multiple ? (
          <MultiSelect
            value={list(value)}
            onValueChange={(next) => {
              if (path !== undefined) onChange(path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            label={label}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        ) : searchable ? (
          <SearchableSelect
            value={scalar(value)}
            onValueChange={(next) => {
              if (path !== undefined) onChange(path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            label={label}
            search={search}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        ) : (
          <Select
            value={scalar(value)}
            onValueChange={(next) => {
              if (node.path !== undefined) onChange(node.path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        )
      }
    </FieldShell>
  );
}

function RadioRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const options = (node.options ?? [])
    .map((option) => ({ value: scalar(option.value), label: option.label }))
    .filter(
      (option): option is { value: string; label: string } => option.value !== null,
    );

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <Radio
          value={scalar(value)}
          onValueChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          options={options}
          status={status}
          binding={binding}
          label={label}
          inline={node.props?.["inline"] === true}
        />
      )}
    </FieldShell>
  );
}

function CheckboxRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <Checkbox
          // Anything but `true` is unticked. A column that has never been
          // written holds null, and a box cannot be half on.
          checked={value === true}
          onCheckedChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
        />
      )}
    </FieldShell>
  );
}

function ToggleRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};

  // No `FieldShell`: this control carries its own label and its own reserved
  // help line, because the design puts the label beside the switch rather than
  // above it. Wrapping it would give the row two labels and two help lines.
  return (
    <Toggle
      // Anything but `true` is off. A column never written holds null, and a
      // switch cannot be half on.
      checked={value === true}
      onCheckedChange={(next) => {
        if (node.path !== undefined) onChange(node.path, next);
      }}
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...(typeof props["onIcon"] === "string" ? { onIcon: props["onIcon"] } : {})}
      {...(typeof props["offIcon"] === "string" ? { offIcon: props["offIcon"] } : {})}
      {...(typeof props["onColor"] === "string" ? { onColor: props["onColor"] } : {})}
    />
  );
}

function TextareaRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const rows = props["rows"];
  const maxLength = props["maxLength"];

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
          autosize={props["autosize"] === true}
          {...(typeof rows === "number" ? { rows } : {})}
          {...(typeof maxLength === "number" ? { maxLength } : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

/** The presentation rule the server declared, off `props` and typed on the way. */
function entryFormat(node: SchemaNode): {
  format?: string;
  timezone?: string;
  currency?: string;
  decimals?: number;
} {
  const props = node.props ?? {};
  const out: {
    format?: string;
    timezone?: string;
    currency?: string;
    decimals?: number;
  } = {};

  for (const key of ["format", "timezone", "currency"] as const) {
    const value = props[key];
    if (typeof value === "string") out[key] = value;
  }
  if (typeof props["decimals"] === "number") out.decimals = props["decimals"];
  return out;
}

function TextEntryRenderer({ node }: NodeProps): ReactNode {
  // No status: an entry is never disabled, never in flight and never in error.
  // Passing a resting one would say those states exist for it.
  return (
    <FieldShell
      label={node.label ?? ""}
      status={{ lifecycle: "rest" }}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <TextEntry
          value={node.value}
          describedBy={binding.id}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
          {...entryFormat(node)}
        />
      )}
    </FieldShell>
  );
}

function PlaceholderRenderer({ node, error, pending, inFlight }: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <Placeholder
          status={status}
          describedBy={binding.id}
          {...(node.content === undefined ? {} : { content: node.content })}
        />
      )}
    </FieldShell>
  );
}

/**
 * A field the reader never sees draws nothing at all.
 *
 * Registered rather than left out: an unregistered type shows the marker meant
 * for a component nobody wrote, and a hidden field is not a gap in the panel.
 * Its value travels in the payload's state, which is all it needs to survive a
 * round trip it is never allowed to change.
 */
function HiddenRenderer(): ReactNode {
  return null;
}

/**
 * The field carries one wall clock; the control works in two segments.
 *
 * `2026-03-29T02:30` splits on the `T` and joins back on it. No `Date` is built
 * on either side — a `Date` carries a zone, and the whole point of the string is
 * that it carries none.
 */
function splitWall(value: unknown, withTime: boolean): { date: string; time?: string } {
  if (typeof value !== "string") return { date: "" };
  const [date = "", time] = value.split("T");
  return withTime && time !== undefined ? { date, time } : { date };
}

function DateTimePickerRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const withTime = props["withTime"] !== false;
  const zone = props["timezone"];
  const min = props["minDate"];
  const max = props["maxDate"];

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <DateTimePicker
          value={splitWall(value, withTime)}
          onChange={(next) => {
            if (node.path === undefined) return;
            // An empty date is a cleared field, not a half-written one: sending
            // `T14:30` would be a wall clock the boundary refuses and a value
            // the reader cannot see was rejected.
            const joined =
              next.date === ""
                ? ""
                : withTime && next.time !== undefined && next.time !== ""
                  ? `${next.date}T${next.time}`
                  : next.date;
            onChange(node.path, joined);
          }}
          status={status}
          binding={binding}
          dateOnly={!withTime}
          {...(typeof zone === "string" ? { timeZone: zone } : {})}
          {...(typeof min === "string" ? { min } : {})}
          {...(typeof max === "string" ? { max } : {})}
        />
      )}
    </FieldShell>
  );
}

function FileUploadRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  uploadFile,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const path = node.path;
  const types = props["acceptedFileTypes"];
  const maxSize = props["maxSize"];
  // Where the stored file can be fetched. The adapter decides what a key
  // resolves to, so the server is the only side that can say.
  const previewUrl = props["previewUrl"];

  // Stable per path, so the control does not see a new function each render.
  const send = useCallback(
    async (file: File) => {
      if (uploadFile === undefined || path === undefined) {
        throw new Error("Uploading is not available here.");
      }
      return await uploadFile(path, file);
    },
    [uploadFile, path],
  );

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <FileUpload
          value={typeof value === "string" ? value : ""}
          onValueChange={(key) => {
            if (path !== undefined) onChange(path, key);
          }}
          status={status}
          binding={binding}
          {...(uploadFile === undefined || path === undefined ? {} : { upload: send })}
          {...(Array.isArray(types) ? { accept: types.join(",") } : {})}
          {...(typeof maxSize === "number" ? { maxSize } : {})}
          {...(typeof previewUrl === "string" && previewUrl !== ""
            ? { previewUrl }
            : {})}
        />
      )}
    </FieldShell>
  );
}

/**
 * Called once at module load. A plugin adds its own with the same function
 * (extension point E3) — there is no privileged path for the built-ins.
 */
/**
 * A repeater, and its rows.
 *
 * The payload's children are flat — every field of every row — because the
 * server addresses them that way. Grouping them back is this file's job, and
 * the key is read off the path rather than tracked: the server already put it
 * there, and anything this remembered could disagree with what came back.
 *
 * The value is the ordered list of keys. Adding, removing and reordering are
 * all writes to that one path, which is why none of them needs a route of its
 * own.
 */
function RepeaterRenderer({
  node,
  value,
  error,
  onChange,
  renderChild,
  valueAt,
  errorAt,
}: NodeProps): ReactNode {
  const path = node.path;
  const keys = Array.isArray(value) ? value.filter(isKey) : [];
  const max = node.props?.["maxItems"];

  const rows = new Map<string, SchemaNode[]>();
  for (const child of node.children ?? []) {
    const key = rowKeyOf(path, child.path);
    if (key === undefined) continue;
    const group = rows.get(key);
    if (group === undefined) rows.set(key, [child]);
    else group.push(child);
  }

  // In the order the value gives, not the order the payload arrived in: the
  // list is what says where a row sits.
  //
  // A row with nothing in any of its fields is marked pending, because that is
  // what the server does with it: it is not written until something is filled
  // in. Saying so is the difference between a row that will be saved and one
  // that looks identical and will not.
  const labels = node.props?.["itemLabels"];
  const items: RepeaterItem[] = keys.map((key) => {
    const named = labelOf(labels, key);
    // The row carries what its fields were refused. A folded row would
    // otherwise hide the reason a form will not save.
    const refused = firstError(rows.get(key), errorAt);
    return {
      id: key,
      ...(isBlankRow(rows.get(key), valueAt) ? { pending: true } : {}),
      ...(named === undefined ? {} : { label: named }),
      ...(refused === undefined ? {} : { error: refused }),
    };
  });

  return (
    <div className="perch-field" data-error={error !== undefined}>
      <Repeater
        title={node.label ?? path ?? ""}
        items={items}
        {...(typeof max === "number" ? { max } : {})}
        {...(node.props?.["collapsible"] === true ? { collapsible: true } : {})}
        onAdd={() => {
          if (path !== undefined) onChange(path, [...keys, newRowKey()]);
        }}
        onRemove={(id) => {
          if (path !== undefined)
            onChange(
              path,
              keys.filter((key) => key !== id),
            );
        }}
        onReorder={(ids) => {
          // Trusted only as far as it names what is already there: a reorder
          // moves rows, it does not invent or drop them.
          if (path === undefined) return;
          const known = ids.filter((id) => keys.includes(id));
          if (known.length === keys.length) onChange(path, known);
        }}
      >
        {(item) => (rows.get(item.id) ?? []).map(renderChild)}
      </Repeater>
      <div className="perch-field__help" data-error={error !== undefined} role="status">
        {error ?? ""}
      </div>
    </div>
  );
}

/** What the server called this row, if the field said how to name one. */
function labelOf(labels: unknown, key: string): string | undefined {
  if (typeof labels !== "object" || labels === null) return undefined;
  const held = (labels as Record<string, unknown>)[key];
  return typeof held === "string" ? held : undefined;
}

/**
 * What the server refused in this row, if it refused anything.
 *
 * The first one: a row is a line, and a line has room for one message. The
 * fields carry their own underneath once the row is open.
 */
function firstError(
  fields: readonly SchemaNode[] | undefined,
  errorAt: (path: string) => string | undefined,
): string | undefined {
  for (const node of fields ?? []) {
    const said = node.path === undefined ? undefined : errorAt(node.path);
    if (said !== undefined) return said;
  }
  return undefined;
}

/** Nothing typed in any of the row's fields, which is what "pending" means. */
function isBlankRow(
  fields: readonly SchemaNode[] | undefined,
  valueAt: (path: string) => unknown,
): boolean {
  return (fields ?? []).every((node) => {
    const held = node.path === undefined ? undefined : valueAt(node.path);
    return held === undefined || held === null || held === "";
  });
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** `items.r1.label` under `items` is `r1`. */
function rowKeyOf(
  parent: string | undefined,
  path: string | undefined,
): string | undefined {
  if (parent === undefined || path === undefined) return undefined;
  if (!path.startsWith(`${parent}.`)) return undefined;
  const rest = path.slice(parent.length + 1);
  const dot = rest.indexOf(".");
  return dot === -1 ? undefined : rest.slice(0, dot);
}

/**
 * A name for a row that has just been added.
 *
 * It only has to be unlike every other key in this list — the server decides
 * what it means, and a key it has never seen is a create whatever it looks
 * like. `randomUUID` where the platform has it, and something unique enough
 * where it does not.
 */
function newRowKey(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return (
    crypto?.randomUUID?.() ??
    `new-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
}

export function registerBuiltInComponents(): void {
  registerComponent("Schema", LayoutRenderer);
  registerComponent("Section", LayoutRenderer);
  registerComponent("Grid", LayoutRenderer);
  registerComponent("TextInput", TextInputRenderer);
  registerComponent("Select", SelectRenderer);
  registerComponent("Checkbox", CheckboxRenderer);
  registerComponent("Radio", RadioRenderer);
  registerComponent("DateTimePicker", DateTimePickerRenderer);
  registerComponent("FileUpload", FileUploadRenderer);
  registerComponent("Placeholder", PlaceholderRenderer);
  registerComponent("Hidden", HiddenRenderer);
  registerComponent("Toggle", ToggleRenderer);
  registerComponent("Textarea", TextareaRenderer);
  registerComponent("Repeater", RepeaterRenderer);
  registerComponent("TextEntry", TextEntryRenderer);
}
