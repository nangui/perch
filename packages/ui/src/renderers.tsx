/**
 * The built-in renderers, registered under the same keys the server sends.
 *
 * Each one adapts a `SchemaNode` to a component that already existed and knows
 * nothing about the protocol. That direction matters: the components stay
 * substitutable, which is what a plugin needs to replace one.
 */
import type { ReactNode } from "react";
import type { SchemaNode } from "@perchjs/core";
import { FieldShell } from "./FieldShell.js";
import type { FieldStatus } from "./field-state.js";
import { Select } from "./fields/Select.js";
import { TextInput } from "./fields/TextInput.js";
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

/** `columns` reaches the CSS as a variable, so the grid stays in the stylesheet. */
function columnsStyle(node: SchemaNode): Record<string, string> | undefined {
  const columns = node.props?.["columns"];
  if (typeof columns !== "number") return undefined;
  return { "--perch-columns": String(columns) };
}

function LayoutRenderer({ node, renderChild }: NodeProps): ReactNode {
  return (
    <div className={`perch-layout perch-layout--${node.type.toLowerCase()}`}>
      {node.label === undefined ? null : (
        <div className="perch-layout__title">{node.label}</div>
      )}
      <div className="perch-layout__body" style={columnsStyle(node)}>
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
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const options = (node.options ?? [])
    .map((option) => ({ value: scalar(option.value), label: option.label }))
    .filter(
      (option): option is { value: string; label: string } => option.value !== null,
    );

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
    >
      {(binding) => (
        <Select
          value={scalar(value)}
          onValueChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          options={options}
          status={status}
          binding={binding}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

/**
 * Called once at module load. A plugin adds its own with the same function
 * (extension point E3) — there is no privileged path for the built-ins.
 */
export function registerBuiltInComponents(): void {
  registerComponent("Schema", LayoutRenderer);
  registerComponent("Section", LayoutRenderer);
  registerComponent("Grid", LayoutRenderer);
  registerComponent("TextInput", TextInputRenderer);
  registerComponent("Select", SelectRenderer);
}
