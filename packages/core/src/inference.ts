/**
 * Field inference (PRD 01 §3.2): what `TextInput.make('email')` should already
 * know without being told.
 *
 * This produces a *description* of the field to build, not a builder — builders
 * arrive with PRD 02. Keeping it as data means the CLI can print it, tests can
 * assert on it, and the schema engine can override any part of it. Every
 * inference here is a default, never a constraint (PRD 01 §7).
 *
 * Name-based inference is the part that surprises people, so it is switchable:
 * `strict: true` keeps only what the database actually declares.
 */
import type { FieldMeta, ModelMeta, RelationMeta, Ir } from "./ir.js";
import { findModel } from "./ir.js";

export type ComponentKind =
  | "TextInput"
  | "Textarea"
  | "Toggle"
  | "Select"
  | "DateTimePicker"
  | "KeyValue"
  | "CodeEditor";

/**
 * `tel` is never inferred — no metadata says "this column holds a phone number"
 * — but PRD 06 §3.1 lets a field be told, so the flavour has to admit it.
 */
export type TextFlavour = "text" | "email" | "password" | "url" | "numeric" | "tel";

export interface InferredField {
  readonly name: string;
  readonly component: ComponentKind;
  readonly flavour?: TextFlavour;
  readonly required: boolean;
  readonly unique: boolean;
  readonly maxLength?: number;
  readonly precision?: number;
  readonly scale?: number;
  /** Date without time: the name ends in `Date` or `On`. */
  readonly dateOnly?: boolean;
  readonly options?: readonly string[];
  /** For a to-one relation: the target model and the field to display. */
  readonly relationship?: { readonly model: string; readonly labelField: string };
  readonly helperText?: string;
  /** A password left blank must not overwrite the stored hash with "". */
  readonly dehydrateWhenEmpty?: false;
  /** Why this field is not offered in a form. */
  readonly excludedFromForm?:
    "read-only" | "identifier" | "to-many-relation" | "soft-delete";
}

export interface InferenceOptions {
  /** Disables inference from field names, keeping only declared metadata. */
  readonly strict?: boolean;
}

/** The soft-delete convention, named once so the reader and the form agree. */
export const SOFT_DELETE_FIELD = "deletedAt";

const NUMERIC_TYPES = new Set(["Int", "Float", "Decimal", "BigInt"]);

const EMAIL_WORDS = new Set(["email", "mail"]);
const PASSWORD_WORDS = new Set(["password", "passwd", "pwd"]);
const URL_WORDS = new Set(["url", "uri", "link", "href", "website", "homepage"]);
const DATE_ONLY_WORDS = new Set(["date", "on", "day", "birthday"]);

/**
 * Splits a field name into lowercase words: `websiteUrl` → `["website", "url"]`,
 * `avatar_URL` → `["avatar", "url"]`.
 *
 * Matching whole words rather than substrings is what makes this predictable in
 * both directions. A substring test misses `websiteUrl`, because `url` sits at a
 * camelCase boundary rather than a non-letter one; and it fires on `season` for a
 * rule about names ending in `on`. Both were real.
 */
export function tokenize(name: string): readonly string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

function hasWord(name: string, words: ReadonlySet<string>): boolean {
  return tokenize(name).some((word) => words.has(word));
}

function endsWithWord(name: string, words: ReadonlySet<string>): boolean {
  const tokens = tokenize(name);
  const last = tokens[tokens.length - 1];
  return last !== undefined && words.has(last);
}

/**
 * Label field resolution, in the priority order of PRD 01 §3.2:
 * name → title → label → email → slug → first unique String → primary key.
 */
export function inferLabelField(
  fields: readonly FieldMeta[],
  primaryKeyName: string,
): string {
  for (const candidate of ["name", "title", "label", "email", "slug"]) {
    const hit = fields.find((f) => f.name === candidate && f.type === "String");
    if (hit) return hit.name;
  }
  const unique = fields.find((f) => f.type === "String" && f.isUnique && !f.isId);
  if (unique) return unique.name;
  return primaryKeyName;
}

export function inferField(
  field: FieldMeta,
  options: InferenceOptions = {},
): InferredField {
  const byName = options.strict !== true;

  if (field.isId) {
    return base(field, { component: "TextInput", excludedFromForm: "identifier" });
  }
  if (field.isReadOnly) {
    return base(field, { component: "TextInput", excludedFromForm: "read-only" });
  }

  if (field.kind === "enum") {
    return base(field, {
      component: "Select",
      ...(field.enumValues ? { options: field.enumValues } : {}),
    });
  }

  if (field.kind === "json" || field.type === "Json") {
    // KeyValue lands in v0.2; until then the honest fallback is a code editor.
    return base(field, { component: "CodeEditor" });
  }

  switch (field.type) {
    case "Boolean":
      return base(field, { component: "Toggle" });

    case "DateTime":
      return base(field, {
        component: "DateTimePicker",
        ...(byName && endsWithWord(field.name, DATE_ONLY_WORDS)
          ? { dateOnly: true }
          : {}),
      });

    case "String": {
      if (field.isLongText) return base(field, { component: "Textarea" });
      if (byName && hasWord(field.name, PASSWORD_WORDS)) {
        return base(field, {
          component: "TextInput",
          flavour: "password",
          dehydrateWhenEmpty: false,
        });
      }
      if (byName && hasWord(field.name, EMAIL_WORDS)) {
        return base(field, { component: "TextInput", flavour: "email" });
      }
      if (byName && hasWord(field.name, URL_WORDS)) {
        return base(field, { component: "TextInput", flavour: "url" });
      }
      return base(field, { component: "TextInput", flavour: "text" });
    }

    default:
      if (NUMERIC_TYPES.has(field.type)) {
        return base(field, { component: "TextInput", flavour: "numeric" });
      }
      // Bytes and anything the IR gains later: a text input is wrong but
      // visible, which beats silently dropping the field.
      return base(field, { component: "TextInput", flavour: "text" });
  }
}

export function inferRelation(relation: RelationMeta, ir: Ir): InferredField {
  if (relation.type === "many") {
    return {
      name: relation.name,
      component: "Select",
      required: false,
      unique: false,
      excludedFromForm: "to-many-relation",
      ...(relation.documentation ? { helperText: relation.documentation } : {}),
    };
  }

  const target = findModel(ir, relation.targetModel);
  return {
    name: relation.name,
    component: "Select",
    required: relation.isRequired,
    unique: false,
    relationship: {
      model: relation.targetModel,
      labelField: target?.labelField ?? "id",
    },
    ...(relation.documentation ? { helperText: relation.documentation } : {}),
  };
}

/**
 * Every form-eligible field of a model, relations included, in IR order.
 * Excluded fields are returned too, carrying their reason: the CLI shows them
 * commented out, which is more useful than pretending they do not exist.
 */
export function inferModel(
  model: ModelMeta,
  ir: Ir,
  options: InferenceOptions = {},
): readonly InferredField[] {
  // A foreign key is represented by its relation, never twice.
  const foreignKeys = new Set(model.relations.flatMap((r) => [...r.foreignKeyFields]));
  return [
    ...model.fields
      .filter((f) => !foreignKeys.has(f.name))
      .map((f) => inferField(f, options))
      .map((f) => (isTombstone(model, f.name) ? tombstone(f) : f)),
    ...model.relations.map((r) => inferRelation(r, ir)),
  ];
}

/**
 * The column that records the deletion, on a model that deletes softly.
 *
 * Offering it is offering a date picker that deletes the row, which is the one
 * thing a form must not do by accident. A model whose configuration says it
 * does not soft-delete keeps the column editable: it is then an ordinary date.
 *
 * Not `isReadOnly` — nothing generates this value, the framework claims it.
 *
 * The name alone, where the DMMF reader also requires `DateTime`. That
 * asymmetry is deliberate: the convention has to be sure before it infers, and
 * configuration that declares the flag has already been sure.
 */
function isTombstone(model: ModelMeta, name: string): boolean {
  return model.hasSoftDelete && name === SOFT_DELETE_FIELD;
}

function tombstone(field: InferredField): InferredField {
  return { ...field, excludedFromForm: "soft-delete" };
}

function base(
  field: FieldMeta,
  extra: Omit<InferredField, "name" | "required" | "unique">,
): InferredField {
  return {
    name: field.name,
    // A field with a default is not required of the user: the database fills it.
    required: field.isRequired && !field.hasDefault && !field.isList,
    unique: field.isUnique,
    ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
    ...(field.precision !== undefined ? { precision: field.precision } : {}),
    ...(field.scale !== undefined ? { scale: field.scale } : {}),
    ...(field.documentation ? { helperText: field.documentation } : {}),
    ...extra,
  };
}
