/**
 * The intermediate representation: what the domain knows about a data model.
 *
 * These types live in the domain, not in the Prisma adapter, because the domain
 * defines the port and the adapter fills it. A Drizzle adapter would produce
 * the same shapes from entirely different metadata, and nothing in the schema
 * engine would notice.
 */

/** Scalar types the IR carries. Named after Prisma's, but not owned by it. */
export type ScalarType =
  | "String"
  | "Int"
  | "Float"
  | "Decimal"
  | "Boolean"
  | "DateTime"
  | "Json"
  | "Bytes"
  | "BigInt";

export type FieldKind = "scalar" | "enum" | "json";

export interface FieldMeta {
  readonly name: string;
  readonly kind: FieldKind;
  readonly type: ScalarType;
  readonly isRequired: boolean;
  readonly isList: boolean;
  readonly isId: boolean;
  readonly isUnique: boolean;
  /**
   * Produced when the row is written rather than chosen: `autoincrement()`,
   * `now()`, `uuid()`, `dbgenerated()`, `@updatedAt`. Not "has a database
   * default" — `@default(true)` is one and is a value a person can pick.
   *
   * Not the column a relation owns; that is `RelationMeta.foreignKeyFields`.
   */
  readonly isReadOnly: boolean;
  readonly hasDefault: boolean;
  readonly default?: unknown;
  readonly enumValues?: readonly string[];
  /** From `@db.VarChar(n)`. */
  readonly maxLength?: number;
  /** From `@db.Decimal(p, s)`. */
  readonly precision?: number;
  readonly scale?: number;
  /** A `///` comment on the field. Becomes helper text. */
  readonly documentation?: string;
  /** True for `@db.Text`: renders as a textarea rather than a single line. */
  readonly isLongText: boolean;
}

export type RelationCardinality = "one" | "many";

export type ReferentialAction = "Cascade" | "SetNull" | "Restrict" | "NoAction";

export interface RelationMeta {
  readonly name: string;
  readonly type: RelationCardinality;
  readonly targetModel: string;
  /**
   * The name both sides of the relation share.
   *
   * What pairs a to-many with the to-one that holds its column. Two relations
   * between the same pair of models are told apart by nothing else — the
   * columns are on one side and the list is on the other, so without this the
   * only way back is a guess between two.
   */
  readonly relationName: string;
  readonly foreignKeyFields: readonly string[];
  readonly referencedFields: readonly string[];
  readonly isRequired: boolean;
  readonly isList: boolean;
  readonly onDelete?: ReferentialAction;
  readonly documentation?: string;
}

export interface ModelMeta {
  readonly name: string;
  readonly dbName: string;
  readonly primaryKey: FieldMeta;
  readonly fields: readonly FieldMeta[];
  readonly relations: readonly RelationMeta[];
  readonly uniqueConstraints: readonly (readonly string[])[];
  /**
   * The model carries a deletion column, detected by the `deletedAt` convention
   * or declared in configuration.
   *
   * It says nothing about what the framework does with it. In v0.1 it keeps the
   * tombstone out of an inferred form and nothing else — reads do not filter
   * and `DataAdapter.delete` destroys the row.
   */
  readonly hasSoftDelete: boolean;
  /**
   * The field a human reads to recognise a row, resolved in priority order:
   * name → title → label → email → slug → first unique String → primary key.
   */
  readonly labelField: string;
  readonly documentation?: string;
}

/** Everything the domain knows about the data source, resolved once at bootstrap. */
export interface Ir {
  readonly models: readonly ModelMeta[];
}

export function findModel(ir: Ir, name: string): ModelMeta | undefined {
  return ir.models.find((m) => m.name === name);
}

export function findField(model: ModelMeta, name: string): FieldMeta | undefined {
  return model.fields.find((f) => f.name === name);
}

export function findRelation(model: ModelMeta, name: string): RelationMeta | undefined {
  return model.relations.find((r) => r.name === name);
}
