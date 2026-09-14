/**
 * `@perchjs/ui` — the React renderer and its component registry.
 *
 * Imports `@perchjs/core` for types only, which is why core sits in
 * devDependencies: no domain value reaches the browser bundle. Enforced by the
 * `ui-imports-core-types-only` rule.
 *
 * Shipped precompiled and served as static assets by the PanelModule. The user
 * configures neither Vite, Webpack nor Tailwind.
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
export type { ColumnRenderer } from "./column-registry.js";
export {
  lookupColumn,
  registerColumn,
  resetColumnRegistry,
} from "./column-registry.js";
export { registerBuiltInColumns } from "./columns.js";
export type { DataTableProps, DataTableSort } from "./DataTable.js";
export type { PageRequest, PanelListProps, RecordsPage } from "./PanelList.js";
export type { NavigationGroup, NavigationItem, PanelNavProps } from "./PanelNav.js";
export { PanelNav } from "./PanelNav.js";
export { PanelList } from "./PanelList.js";
export { DataTable } from "./DataTable.js";
export type { BreadcrumbProps } from "./Breadcrumb.js";
export { Breadcrumb } from "./Breadcrumb.js";
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

// The renderer: walks the tree the server resolved.
export type { NodeProps } from "./node-props.js";
export type { SchemaRendererProps } from "./SchemaRenderer.js";
export { SchemaRenderer } from "./SchemaRenderer.js";
export { lookupComponent, registerComponent, resetRegistry } from "./registry.js";
export type { PanelUserItem, PanelUserMenu, PanelUserProps } from "./PanelUser.js";
export { PanelUser } from "./PanelUser.js";
export type { HookPosition, RenderHookOptions, RenderHooksProps } from "./hooks.js";
export {
  HOOK_POSITIONS,
  hasRenderHooks,
  isHookPosition,
  registerRenderHook,
  RenderHooks,
  resetRenderHooks,
} from "./hooks.js";
export { registerBuiltInComponents } from "./renderers.js";

// The transport client: reconciliation and ordering.
export type {
  Snapshot,
  StateRequest,
  StateResponse,
  TransportFailure,
  TransportOptions,
} from "./transport.js";
export { TransportClient } from "./transport.js";

// The form: transport plus renderer, which is A1 on the client.
export type { PanelFormProps } from "./PanelForm.js";
export { PanelForm } from "./PanelForm.js";
