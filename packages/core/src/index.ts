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
  DataAdapter,
  Filter,
  FilterOperator,
  Id,
  IncludePlan,
  Page,
  Query,
  RelationWrite,
  Row,
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

// Row actions: PRD 08 §4, the v0.1 slice of it.
export type { ActionState } from "./action.js";
export { Action, CreateAction, EditAction } from "./action.js";

// Tables: the column layer PRD 07 §4 opens with.
export type { ColumnState } from "./column.js";
export { Column, IconColumn, TextColumn } from "./column.js";
export type { ActionNode, ColumnNode, ColumnTree, TableState } from "./table.js";
export { serialiseTable, sortablePaths, Table } from "./table.js";

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

// The declarative component tree: what a resource declares (PRD 02).
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

// Fields: components that hold state and are validated (PRD 06).
export type {
  FieldState,
  LiveConfig,
  StateHook,
  StateHookContext,
  StateTransform,
  ValidationRule,
} from "./field.js";
export { baseFieldState, Field, isDehydrated } from "./field.js";

export type { TextInputState } from "./fields/text-input.js";
export { TextInput } from "./fields/text-input.js";

export type { Option, OptionsInput, SelectState } from "./fields/select.js";
export { normaliseOptions, Select } from "./fields/select.js";

// The resolution cycle (PRD 02 §4).
export type {
  DependencyTrace,
  FieldErrors,
  FormState,
  ResolvedNode,
  ResolveOptions,
  ResolveResult,
} from "./resolve.js";
export { dehydrate, ResolutionCycleError, resolveSchema } from "./resolve.js";

// Stage 5, the trust boundary (ARCH 12 §2).
export type { RejectedPath, RejectionReason, SanitizeResult } from "./sanitize.js";
export { sanitize } from "./sanitize.js";

// The wire format (PRD 03 §3).
export type { SchemaNode, SchemaPayload } from "./serialise.js";
export { serialise } from "./serialise.js";
