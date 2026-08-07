/**
 * `@perchjs/ui` — the React renderer and its component registry.
 *
 * Imports `@perchjs/core` for types only, which is why core sits in
 * devDependencies: no domain value reaches the browser bundle. Enforced by the
 * `ui-imports-core-types-only` rule.
 *
 * Shipped precompiled and served as static assets by the PanelModule. The user
 * configures neither Vite, Webpack nor Tailwind (ARCH 13 §8).
 *
 * Styles are a separate entry: `import "@perchjs/ui/styles.css"`.
 */

// The state vocabulary every field shares.
export type {
  FieldKindForDebounce,
  FieldLifecycle,
  FieldStatus,
  StatusAttributes,
} from "./field-state.js";
export {
  DEBOUNCE_MS,
  debounceFor,
  isLocked,
  REST,
  statusAttributes,
} from "./field-state.js";

// The wrapper that reserves the help line.
export type { ControlBinding, FieldShellProps } from "./FieldShell.js";
export { FieldShell } from "./FieldShell.js";

// Fields.
export type { TextFlavour, TextInputProps } from "./fields/TextInput.js";
export { StatusMark, TextInput } from "./fields/TextInput.js";
export type { TextareaProps } from "./fields/Textarea.js";
export { Textarea } from "./fields/Textarea.js";
export type { ToggleProps } from "./fields/Toggle.js";
export { Toggle } from "./fields/Toggle.js";
export type { SelectOption, SelectProps } from "./fields/Select.js";
export { Select } from "./fields/Select.js";
export type { DateTimePickerProps, DateTimeValue } from "./fields/DateTimePicker.js";
export { Calendar, DateTimePicker } from "./fields/DateTimePicker.js";
export type { CodeDiagnostic, CodeEditorProps } from "./fields/CodeEditor.js";
export { CodeEditor, parseJsonDocument } from "./fields/CodeEditor.js";
export type { RepeaterItem, RepeaterProps } from "./fields/Repeater.js";
export { Repeater, REPEATER_SHORTCUTS } from "./fields/Repeater.js";

// The renderer: walks the tree the server resolved (ARCH 13 §6, §7).
export type { NodeProps } from "./node-props.js";
export type { SchemaRendererProps } from "./SchemaRenderer.js";
export { SchemaRenderer } from "./SchemaRenderer.js";
export { lookupComponent, registerComponent, resetRegistry } from "./registry.js";
export { registerBuiltInComponents } from "./renderers.js";
