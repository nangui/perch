/**
 * The only file in the codebase that knows the shape of Prisma's DMMF.
 *
 * PRD 01 §4 requires this isolation, and the reason is stated there: the DMMF is
 * not a stable public API of Prisma. Everything that could break on a Prisma
 * upgrade is therefore in one file, covered by a contract test that fails loudly
 * rather than producing a subtly wrong IR.
 *
 * Supported Prisma range: see SUPPORTED_PRISMA_RANGE below. Read once, while
 * `prisma generate` runs — never at boot, and never on a hot path.
 */
import type {
  FieldMeta,
  ModelMeta,
  RelationMeta,
  ReferentialAction,
  ScalarType,
  Ir,
} from "@perchjs/core";
import { inferLabelField } from "@perchjs/core";

/**
 * Prisma 7 is the first version whose runtime DMMF no longer carries this shape,
 * which is why the IR is generated rather than read (ADR 0012). The generator
 * receives it, and the contract test is what proves the range: widen it only
 * with that test passing against the wider version.
 */
export const SUPPORTED_PRISMA_RANGE = ">=7.0.0 <8.0.0";

const SCALARS = new Set<string>([
  "String",
  "Int",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
  "BigInt",
]);

const REFERENTIAL_ACTIONS = new Set<string>([
  "Cascade",
  "SetNull",
  "Restrict",
  "NoAction",
]);

/**
 * The subset of the DMMF this reader depends on. Declared structurally rather
 * than imported, so what a Prisma release can break shows up here as a diff and
 * the contract test has something concrete to assert against.
 */
export interface DmmfField {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly isRequired: boolean;
  readonly isList: boolean;
  readonly isId: boolean;
  readonly isUnique: boolean;
  readonly isReadOnly: boolean;
  readonly isUpdatedAt?: boolean;
  readonly hasDefaultValue: boolean;
  readonly default?: unknown;
  readonly documentation?: string;
  readonly relationName?: string;
  readonly relationFromFields?: readonly string[];
  readonly relationToFields?: readonly string[];
  readonly relationOnDelete?: string;
  readonly nativeType?: readonly [string, readonly string[]] | null;
}

export interface DmmfModel {
  readonly name: string;
  readonly dbName?: string | null;
  readonly fields: readonly DmmfField[];
  readonly primaryKey?: { readonly fields: readonly string[] } | null;
  readonly uniqueFields?: readonly (readonly string[])[];
  readonly documentation?: string;
}

export interface DmmfEnum {
  readonly name: string;
  readonly values: readonly { readonly name: string }[];
}

export interface Dmmf {
  readonly datamodel: {
    readonly models: readonly DmmfModel[];
    readonly enums: readonly DmmfEnum[];
  };
}

export class DmmfContractError extends Error {
  constructor(message: string) {
    super(
      `${message}\n\nThis usually means the installed Prisma version changed the ` +
        `shape of its DMMF. Supported range: ${SUPPORTED_PRISMA_RANGE}. Only ` +
        `packages/prisma-generator/src/dmmf-reader.ts needs updating.`,
    );
    this.name = "DmmfContractError";
  }
}

export interface ReadOptions {
  /** Models whose `deletedAt` should not be read as a soft delete. */
  readonly softDelete?: Readonly<Record<string, boolean>>;
}

/** Turns a DMMF into the IR. The only entry point of this module. */
export function readDmmf(dmmf: unknown, options: ReadOptions = {}): Ir {
  const datamodel = assertDatamodel(dmmf);
  const enums = new Map(
    datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)] as const),
  );

  return {
    models: datamodel.models.map((model) => readModel(model, enums, options)),
  };
}

function assertDatamodel(dmmf: unknown): Dmmf["datamodel"] {
  if (typeof dmmf !== "object" || dmmf === null) {
    throw new DmmfContractError(
      `Expected the DMMF to be an object, got ${typeof dmmf}.`,
    );
  }
  const datamodel = (dmmf as { datamodel?: unknown }).datamodel;
  if (typeof datamodel !== "object" || datamodel === null) {
    throw new DmmfContractError("The DMMF has no `datamodel` object.");
  }
  const { models, enums } = datamodel as { models?: unknown; enums?: unknown };
  if (!Array.isArray(models)) {
    throw new DmmfContractError("`datamodel.models` is not an array.");
  }
  if (!Array.isArray(enums)) {
    throw new DmmfContractError("`datamodel.enums` is not an array.");
  }
  return datamodel as Dmmf["datamodel"];
}

function readModel(
  model: DmmfModel,
  enums: ReadonlyMap<string, readonly string[]>,
  options: ReadOptions,
): ModelMeta {
  const fields: FieldMeta[] = [];
  const relations: RelationMeta[] = [];

  for (const field of model.fields) {
    if (field.kind === "object") {
      relations.push(readRelation(field, model.name));
      continue;
    }
    if (field.kind === "scalar" || field.kind === "enum") {
      fields.push(readField(field, enums, model.name));
      continue;
    }
    // `unsupported` and anything Prisma adds later: skipped on purpose. A field
    // the IR cannot describe must not be half-described.
  }

  const primaryKey = fields.find((f) => f.isId);
  if (!primaryKey) {
    throw new DmmfContractError(
      `Model ${model.name} has no single-field @id. Composite primary keys are ` +
        `out of scope for v0.1 (PRD 01 §6).`,
    );
  }

  const declared = options.softDelete?.[model.name];
  const hasSoftDelete =
    declared ?? fields.some((f) => f.name === "deletedAt" && f.type === "DateTime");

  return {
    name: model.name,
    dbName: model.dbName ?? model.name,
    primaryKey,
    fields,
    relations,
    uniqueConstraints: [
      [primaryKey.name],
      ...fields.filter((f) => f.isUnique && !f.isId).map((f) => [f.name]),
      ...(model.uniqueFields ?? []).map((group) => [...group]),
    ],
    hasSoftDelete,
    labelField: inferLabelField(fields, primaryKey.name),
    ...(model.documentation ? { documentation: model.documentation } : {}),
  };
}

function readField(
  field: DmmfField,
  enums: ReadonlyMap<string, readonly string[]>,
  modelName: string,
): FieldMeta {
  const isEnum = field.kind === "enum";
  const enumValues = isEnum ? enums.get(field.type) : undefined;

  if (isEnum && !enumValues) {
    throw new DmmfContractError(
      `Field ${modelName}.${field.name} is an enum of type "${field.type}", which ` +
        `is absent from datamodel.enums.`,
    );
  }

  // An enum carries no scalar type of its own; it behaves as a constrained
  // string everywhere downstream.
  const type: ScalarType = isEnum
    ? "String"
    : SCALARS.has(field.type)
      ? (field.type as ScalarType)
      : unsupportedScalar(field, modelName);

  const native = readNativeType(field);

  return {
    name: field.name,
    kind: isEnum ? "enum" : field.type === "Json" ? "json" : "scalar",
    type,
    isRequired: field.isRequired,
    isList: field.isList,
    isId: field.isId,
    isUnique: field.isUnique || field.isId,
    // Two meanings meet here, and they are not the same one. Prisma's
    // `isReadOnly` marks a column a relation owns — a foreign key — and leaves
    // an autoincrement `id` alone. `@updatedAt` it does not mark at all, though
    // the database owns that outright. Both end up excluded from a form, which
    // is the outcome either meaning wants; an `id` gets there through `isId`.
    isReadOnly: field.isReadOnly || field.isUpdatedAt === true,
    hasDefault: field.hasDefaultValue,
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(enumValues ? { enumValues } : {}),
    ...(native.maxLength !== undefined ? { maxLength: native.maxLength } : {}),
    ...(native.precision !== undefined ? { precision: native.precision } : {}),
    ...(native.scale !== undefined ? { scale: native.scale } : {}),
    ...(field.documentation ? { documentation: field.documentation } : {}),
    isLongText: native.isLongText,
  };
}

interface NativeType {
  maxLength?: number;
  precision?: number;
  scale?: number;
  isLongText: boolean;
}

/** Reads `@db.VarChar(255)`, `@db.Text`, `@db.Decimal(10, 2)`. */
function readNativeType(field: DmmfField): NativeType {
  const native = field.nativeType;
  if (!native) return { isLongText: false };
  const [name, args] = native;

  switch (name) {
    case "VarChar":
    case "Char":
    case "NVarChar": {
      const n = Number(args[0]);
      return Number.isFinite(n)
        ? { maxLength: n, isLongText: false }
        : { isLongText: false };
    }
    case "Text":
    case "LongText":
    case "MediumText":
      return { isLongText: true };
    case "Decimal":
    case "Numeric": {
      const precision = Number(args[0]);
      const scale = Number(args[1]);
      return {
        ...(Number.isFinite(precision) ? { precision } : {}),
        ...(Number.isFinite(scale) ? { scale } : {}),
        isLongText: false,
      };
    }
    default:
      return { isLongText: false };
  }
}

function readRelation(field: DmmfField, modelName: string): RelationMeta {
  if (field.relationName === undefined) {
    throw new DmmfContractError(
      `Relation field ${modelName}.${field.name} has no relationName.`,
    );
  }
  const onDelete = field.relationOnDelete;
  return {
    name: field.name,
    type: field.isList ? "many" : "one",
    targetModel: field.type,
    foreignKeyFields: [...(field.relationFromFields ?? [])],
    referencedFields: [...(field.relationToFields ?? [])],
    isRequired: field.isRequired && !field.isList,
    isList: field.isList,
    ...(onDelete !== undefined && REFERENTIAL_ACTIONS.has(onDelete)
      ? { onDelete: onDelete as ReferentialAction }
      : {}),
    ...(field.documentation ? { documentation: field.documentation } : {}),
  };
}

function unsupportedScalar(field: DmmfField, modelName: string): never {
  throw new DmmfContractError(
    `Field ${modelName}.${field.name} has scalar type "${field.type}", which the ` +
      `IR does not describe. Known: ${[...SCALARS].join(", ")}.`,
  );
}
