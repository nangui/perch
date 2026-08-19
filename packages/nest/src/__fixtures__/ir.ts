/**
 * The model metadata a panel test needs before it can say anything.
 *
 * `ModelMeta` has eight properties and a `FieldMeta` has ten, and a test about
 * routing cares about two of them. Written out, the other sixteen are noise
 * that a reader has to check is ordinary before they can find the one line that
 * is not — which is exactly the reading this repository asks of them.
 *
 * Every default is the dullest thing the shape allows, so anything a test
 * passes is a thing that test is about. Nothing here is exported from the
 * package: `files` publishes `dist`, and only `src/index.ts` reaches it.
 */
import type { FieldMeta, ModelMeta } from "@perchjs/core";

/** An autoincrement `Int` primary key, which is what these models all have. */
export function key(over: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "id",
    kind: "scalar",
    type: "Int",
    isRequired: true,
    isList: false,
    isId: true,
    isUnique: true,
    isReadOnly: true,
    hasDefault: true,
    isLongText: false,
    ...over,
  };
}

/** An ordinary column: required text somebody types. */
export function scalar(name: string, over: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name,
    kind: "scalar",
    type: "String",
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefault: false,
    isLongText: false,
    ...over,
  };
}

/**
 * A model with one column and no relations.
 *
 * `fields` follows the key rather than defaulting to empty, because that is
 * what the generator emits and what the tests this replaced were written
 * against. No assertion reads it today; a fixture that drifts from the real
 * shape is how one starts passing for the wrong reason.
 */
export function model(over: Partial<ModelMeta> = {}): ModelMeta {
  const primaryKey = over.primaryKey ?? key();
  return {
    name: "Post",
    dbName: "Post",
    primaryKey,
    fields: [primaryKey],
    relations: [],
    uniqueConstraints: [],
    hasSoftDelete: false,
    labelField: "title",
    ...over,
  };
}
