/**
 * Resolution of relation paths such as `author.country.name` (PRD 01 §3.3).
 *
 * Three jobs, and they are deliberately separate:
 *   - validate the path against the IR, with an error that names what went wrong
 *   - turn it into an include plan, so a relation column costs one query and not
 *     one per row (CLAUDE.md invariant 7)
 *   - read the value without throwing on an intermediate null
 *
 * Depth is capped at three segments in v0.1. Past that the query planner starts
 * producing joins nobody predicted, so it fails loudly instead (PRD 01 §3.3).
 */
import type { FieldMeta, ModelMeta, RelationMeta, Schema } from "./ir.js";
import { findField, findModel, findRelation } from "./ir.js";
import type { IncludePlan } from "./data-adapter.js";

export const MAX_PATH_DEPTH = 3;

export type PathErrorReason =
  | "empty"
  | "too-deep"
  | "unknown-model"
  | "unknown-segment"
  | "scalar-not-last"
  | "list-relation-in-path";

export class PathError extends Error {
  readonly reason: PathErrorReason;
  readonly path: string;
  readonly segment?: string;

  constructor(
    reason: PathErrorReason,
    path: string,
    message: string,
    segment?: string,
  ) {
    super(message);
    this.name = "PathError";
    this.reason = reason;
    this.path = path;
    if (segment !== undefined) this.segment = segment;
  }
}

/** A validated path: the relations to traverse and the scalar field at the end. */
export interface ResolvedPath {
  readonly path: string;
  readonly segments: readonly string[];
  readonly relations: readonly RelationMeta[];
  readonly field: FieldMeta;
  /** The model the final field belongs to. */
  readonly model: ModelMeta;
}

export function resolvePath(
  schema: Schema,
  modelName: string,
  path: string,
): ResolvedPath {
  const segments = path.split(".");
  if (path === "" || segments.some((s) => s === "")) {
    throw new PathError("empty", path, `Path "${path}" has an empty segment.`);
  }
  if (segments.length > MAX_PATH_DEPTH) {
    throw new PathError(
      "too-deep",
      path,
      `Path "${path}" is ${String(segments.length)} levels deep; the limit is ` +
        `${String(MAX_PATH_DEPTH)} in v0.1. Denormalise, or add an explicit ` +
        `accessor on the resource.`,
    );
  }

  let model = findModel(schema, modelName);
  if (!model) {
    throw new PathError(
      "unknown-model",
      path,
      `Unknown model "${modelName}". Known models: ${schema.models
        .map((m) => m.name)
        .join(", ")}.`,
    );
  }

  const relations: RelationMeta[] = [];

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    const field = findField(model, segment);
    const relation = findRelation(model, segment);

    if (field) {
      if (!isLast) {
        throw new PathError(
          "scalar-not-last",
          path,
          `"${segment}" is a scalar field on ${model.name}, so it cannot be ` +
            `traversed in "${path}".`,
          segment,
        );
      }
      return { path, segments, relations, field, model };
    }

    if (!relation) {
      const known = [
        ...model.fields.map((f) => f.name),
        ...model.relations.map((r) => r.name),
      ].join(", ");
      throw new PathError(
        "unknown-segment",
        path,
        `"${segment}" is neither a field nor a relation on ${model.name}. ` +
          `Available: ${known}.`,
        segment,
      );
    }

    if (isLast) {
      throw new PathError(
        "scalar-not-last",
        path,
        `"${path}" ends on the relation "${segment}"; it must end on a scalar ` +
          `field, for example "${segment}.${
            findModel(schema, relation.targetModel)?.labelField ?? "id"
          }".`,
        segment,
      );
    }

    if (relation.type === "many") {
      throw new PathError(
        "list-relation-in-path",
        path,
        `"${segment}" is a to-many relation on ${model.name}; it cannot be ` +
          `traversed in a path because it yields many rows, not one value. ` +
          `Use a relation manager or an aggregate column instead.`,
        segment,
      );
    }

    relations.push(relation);
    const next = findModel(schema, relation.targetModel);
    if (!next) {
      throw new PathError(
        "unknown-model",
        path,
        `Relation "${segment}" on ${model.name} targets unknown model ` +
          `"${relation.targetModel}".`,
        segment,
      );
    }
    model = next;
  }

  // Unreachable: the loop returns or throws on its last iteration.
  throw new PathError("empty", path, `Path "${path}" resolved to nothing.`);
}

/**
 * Merges paths into a single include plan. Called once per request with every
 * path a table or infolist needs, which is what keeps the query count at one.
 */
export function buildIncludePlan(
  schema: Schema,
  modelName: string,
  paths: readonly string[],
): IncludePlan | undefined {
  const plan: Record<string, true | IncludePlan> = {};
  let touched = false;

  for (const path of paths) {
    const { relations } = resolvePath(schema, modelName, path);
    if (relations.length === 0) continue;
    touched = true;

    let cursor = plan;
    for (const [index, relation] of relations.entries()) {
      const isLast = index === relations.length - 1;
      const existing = cursor[relation.name];
      if (isLast) {
        cursor[relation.name] ??= true;
        break;
      }
      // `true` means "load this relation, nothing under it". A deeper path
      // arriving later must widen it into a branch, never the other way round —
      // that is what keeps `author.name` from erasing `author.country.name`.
      const child = existing === undefined || existing === true ? {} : existing;
      cursor[relation.name] = child;
      cursor = child;
    }
  }

  return touched ? plan : undefined;
}

/**
 * Reads a path off a row. A null anywhere along the way yields `undefined`
 * rather than throwing: an optional relation is data, not an error.
 */
export function readPath(row: unknown, path: string): unknown {
  let cursor: unknown = row;
  for (const segment of path.split(".")) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
