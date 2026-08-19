/**
 * `@perchjs/core` — the domain layer.
 *
 * This package imports nothing. Not NestJS, not Prisma, not React, not Express,
 * and not the Node runtime. The boundary is enforced by
 * `.dependency-cruiser.cjs` and blocks CI.
 */

// The intermediate representation: what the domain knows about a data model.
export type {
  FieldKind,
  FieldMeta,
  ModelMeta,
  RelationCardinality,
  RelationMeta,
  ReferentialAction,
  ScalarType,
  Ir,
} from "./ir.js";
export { findField, findModel, findRelation } from "./ir.js";

// The outbound port an adapter fills.
export type {
  Clause,
  ClauseOperator,
  DataAdapter,
  Id,
  IncludePlan,
  Page,
  Query,
  RelationWrite,
  Row,
  Search,
  Sort,
  SortDirection,
  WriteTree,
} from "./data-adapter.js";

// Relation paths: validation, include plans, safe reads.
export type { PathErrorReason, ResolvedPath } from "./path.js";
export {
  buildIncludePlan,
  MAX_PATH_DEPTH,
  PathError,
  readPath,
  resolvePath,
} from "./path.js";

// The naming rules a panel derives from a model name.
export { defaultSlug, kebab, plural } from "./naming.js";

// Infolists. An entry reads the record by a path and never holds state.
export type { EntryState } from "./entry.js";
export { Entry, entryPaths } from "./entry.js";
export { TextEntry } from "./entries/text-entry.js";

// Actions. One class per trigger context, so a callback takes one record and
// a bulk run composes it.
export type {
  ActionGuard,
  ActionRun,
  ActionState,
  Confirmation,
  RecordPage,
} from "./action.js";
export {
  Action,
  CreateAction,
  DeleteAction,
  EditAction,
  ViewAction,
} from "./action.js";
export type { NotificationState, NotificationTone } from "./notification.js";
export type { ActionOutcome, ActionRequest } from "./run-action.js";
export { admittedRecords, runAction } from "./run-action.js";
export { Notification } from "./notification.js";

// Tables, and the column layer.
export type { ColumnState } from "./column.js";
export { Column, IconColumn, TextColumn } from "./column.js";
export type {
  ActionNode,
  ColumnNode,
  ColumnTree,
  FilterNode,
  TableState,
} from "./table.js";
export type { FilterState } from "./filter.js";
export { Filter, SelectFilter, TextFilter } from "./filter.js";
export {
  columnPaths,
  declaredActions,
  declaredFilters,
  searchablePaths,
  serialiseTable,
  sortablePaths,
  Table,
} from "./table.js";

// Field inference: what a field already knows without being told.
export type {
  ComponentKind,
  InferenceOptions,
  InferredField,
  TextFlavour,
} from "./inference.js";
export {
  inferField,
  inferLabelField,
  inferModel,
  inferRelation,
  SOFT_DELETE_FIELD,
  tokenize,
} from "./inference.js";

// The declarative component tree: what a resource declares.
export type {
  ColumnSpan,
  ComponentState,
  Operation,
  Resolvable,
  Resolver,
  ResolverContext,
} from "./component.js";
export { Component, configured, isResolver } from "./component.js";

// Layout components, shared by forms and infolists.
export type { Columns } from "./layout.js";
export { Grid, Schema, Section } from "./layout.js";

// Fields: components that hold state and are validated.
export type {
  FieldState,
  LiveConfig,
  StateHook,
  StateHookContext,
  StateTransform,
  ValidationRule,
} from "./field.js";
export { baseFieldState, Field, isDehydrated } from "./field.js";

export type { CheckboxState } from "./fields/checkbox.js";
export { Checkbox } from "./fields/checkbox.js";

export type { ToggleState } from "./fields/toggle.js";
export { Toggle } from "./fields/toggle.js";

export type { WallClock } from "./zoned.js";
export { isWallClock, toInstant, toWallClock } from "./zoned.js";

export type { IncomingFile, StagedFile, StorageAdapter } from "./storage.js";

export type { FileUploadState } from "./fields/file-upload.js";
export { FileUpload } from "./fields/file-upload.js";

export type { DateTimePickerState } from "./fields/date-time-picker.js";
export { DateTimePicker } from "./fields/date-time-picker.js";

export type { HiddenState } from "./fields/hidden.js";
export { Hidden } from "./fields/hidden.js";

export type { PlaceholderState } from "./fields/placeholder.js";
export { Placeholder } from "./fields/placeholder.js";

export type { RadioState } from "./fields/radio.js";
export { Radio } from "./fields/radio.js";
export type { RepeaterState } from "./fields/repeater.js";
export { MAX_ROW_KEY_LENGTH, Repeater } from "./fields/repeater.js";

export type { TextareaState } from "./fields/textarea.js";
export { Textarea } from "./fields/textarea.js";

export type { TextInputState } from "./fields/text-input.js";
export { TextInput } from "./fields/text-input.js";

export type { Option, OptionsInput } from "./option.js";
export { normaliseOptions } from "./option.js";
export type { SelectState } from "./fields/select.js";
export { Select } from "./fields/select.js";

// The resolution cycle.
export type {
  DependencyTrace,
  FieldErrors,
  FormState,
  OptionsRequest,
  ResolvedNode,
  ResolveOptions,
  ResolveResult,
} from "./resolve.js";
export type { DehydratedWrite } from "./resolve.js";
export {
  DEFAULT_ROW_KEY,
  dehydrate,
  ResolutionCycleError,
  resolveSchema,
} from "./resolve.js";

// What a form promises and cannot keep. Read once, at boot.
export type { Complaint } from "./audit.js";
export { auditInfolist, auditSchema, auditTable, describeComplaints } from "./audit.js";

// Stage 5, the trust boundary.
export type { RejectedPath, RejectionReason, SanitizeResult } from "./sanitize.js";
export { sanitize } from "./sanitize.js";

// The wire format.
export type { SchemaNode, SchemaPayload } from "./serialise.js";
export { serialise } from "./serialise.js";
