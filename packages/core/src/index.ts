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
  tokenize,
} from "./inference.js";
