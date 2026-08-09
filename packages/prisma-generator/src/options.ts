import type { ReadOptions } from "./dmmf-reader.js";

/** What a `generator` block in schema.prisma can hold: strings and lists. */
export type GeneratorConfig = Readonly<Record<string, unknown>>;

/**
 * `softDelete` and `noSoftDelete` name the models the `deletedAt` convention
 * gets wrong, in either direction. Two lists rather than one map because a
 * generator block carries nothing richer.
 */
export function readOptionsOf(config: GeneratorConfig): ReadOptions {
  const softDelete: Record<string, boolean> = {};

  for (const model of listOf(config["noSoftDelete"])) softDelete[model] = false;
  // Second, so a model named in both is on rather than off: turning the flag on
  // is the explicit act, and the other list is a correction to a default.
  for (const model of listOf(config["softDelete"])) softDelete[model] = true;

  return Object.keys(softDelete).length === 0 ? {} : { softDelete };
}

function listOf(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
