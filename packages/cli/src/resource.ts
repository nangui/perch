/**
 * `perch resource <Model>`.
 *
 * The differentiating criterion: a generated resource has to be *immediately
 * good, not an empty skeleton*. So it is not a template with holes. Every line
 * below comes from `inferModel`, which is the same inference the panel itself
 * runs — one source, so a generated file and a hand-written one cannot disagree
 * about what a column means.
 *
 * A field the form does not offer is written out as a comment carrying its
 * reason. `inferModel` returns those deliberately: showing them commented is
 * more useful than pretending the column does not exist, and it tells whoever
 * reads the file why the generator left it alone.
 */
import type { ComponentKind, InferredField, Ir, ModelMeta } from "@perchjs/core";
import { findModel, inferModel } from "@perchjs/core";
import type { Entry } from "./module-edit.js";
import { importFrom, normaliseRoot } from "./module-edit.js";

/**
 * The components `@perchjs/core` actually exports a builder for.
 *
 * `inferModel` names five more — `Textarea`, `Toggle`, `DateTimePicker`,
 * `KeyValue`, `CodeEditor` — which are not built yet. Emitting one of them
 * would import a name that does not exist, and what is generated has to
 * compile. So a field that needs one is written as a comment saying which
 * component it wants, which is a line to finish rather than a build to fix.
 */
const BUILDABLE = new Set<ComponentKind>(["TextInput", "Select"]);

export interface ResourceSource {
  readonly path: string;
  readonly contents: string;
  /** What the panel module has to name to put it on the panel. */
  readonly className: string;
}

/**
 * The file's name, hyphenated: `OrderLine` → `order-line`.
 *
 * Not the URL. `@PanelResource` derives that from the model — `order-lines`,
 * pluralised — and this file writes no `slug`, so that convention holds. The
 * first draft wrote `slug: "user"`, which quietly overrode the framework's own
 * default with a different one.
 */
export function slugOf(model: string): string {
  return model.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function generateResource(ir: Ir, model: string, src = "src"): ResourceSource {
  const meta = findModel(ir, model);
  if (meta === undefined) {
    throw new Error(
      `no model named ${model} in the IR. Run \`prisma generate\` if the schema ` +
        `has changed, or check the spelling against schema.prisma.`,
    );
  }

  const fields = inferModel(meta, ir);

  return {
    path: `${normaliseRoot(src)}/admin/resources/${slugOf(model)}.resource.ts`,
    contents: file(meta, fields),
    className: `${meta.name}Resource`,
  };
}

/**
 * What registers it on the panel: the entry `perch panel`'s module gains.
 *
 * Named here rather than by the caller because the class name and the file name
 * are decided here — two rules kept apart drift, and the symptom would be an
 * import of a class that does not exist.
 */
export function resourceEntry(generated: ResourceSource, src = "src"): Entry {
  return {
    className: generated.className,
    from: importFrom(`${normaliseRoot(src)}/admin/admin.module.ts`, generated.path),
    key: "resources",
  };
}

function file(meta: ModelMeta, fields: readonly InferredField[]): string {
  const used = new Set<string>(
    fields.filter((field) => offered(field)).map((field) => field.component),
  );
  used.add("Schema");
  used.add("Table");
  used.add("TextColumn");
  used.add("CreateAction");
  used.add("EditAction");

  return `import {
${[...used]
  .sort()
  .map((name) => `  ${name},`)
  .join("\n")}
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "${meta.name}" })
export class ${meta.name}Resource {
  table(): Table {
${tableBody(meta, fields)}
  }

  form(): Schema {
    return Schema.make([
${fields.map((field) => formLine(field)).join("\n")}
    ]);
  }
}
`;
}

/**
 * The first few columns a human reads, and never one they should not.
 *
 * Built from the inferred fields rather than the raw ones, so everything the
 * form refuses is refused here too — and a password is dropped on top. The
 * first draft took the first three `String` columns and put `passwordHash` in
 * the table, which is the same oracle the adapter's search and the route's sort
 * were each narrowed to avoid.
 */
function tableBody(meta: ModelMeta, fields: readonly InferredField[]): string {
  const columns = fields
    .filter(
      (field) =>
        field.excludedFromForm === undefined &&
        field.flavour !== "password" &&
        field.relationship === undefined &&
        field.component === "TextInput",
    )
    .slice(0, 3)
    .map((field) => field.name);
  const shown = columns.length === 0 ? [meta.labelField] : columns;

  return `    return Table.make()
      .columns([
${shown
  .map(
    (name) =>
      `        TextColumn.make("${name}")${name === meta.labelField ? ".sortable()" : ""},`,
  )
  .join("\n")}
      ])
      .actions([EditAction.make()])
      .headerActions([CreateAction.make()])
      .defaultSort("${meta.labelField}");`;
}

/** True when this field can be written as a line that compiles. */
function offered(field: InferredField): boolean {
  return field.excludedFromForm === undefined && BUILDABLE.has(field.component);
}

/** A field the form does not offer, written where it would have been. */
function formLine(field: InferredField): string {
  if (field.excludedFromForm !== undefined) {
    return `      // ${field.name} — not offered: ${field.excludedFromForm}`;
  }
  if (!BUILDABLE.has(field.component)) {
    return `      // ${field.name} — wants ${field.component}, which is not built yet`;
  }
  return `      ${field.component}.make("${field.name}")${modifiers(field)},`;
}

/**
 * What the schema already knows, spelled out. Nothing here is a guess: each
 * call answers a piece of metadata the IR carries.
 */
function modifiers(field: InferredField): string {
  const out: string[] = [];

  if (field.relationship !== undefined) {
    out.push(`.relationship("${field.name}", "${field.relationship.labelField}")`);
  }
  if (field.flavour === "email") out.push(".email()");
  if (field.flavour === "url") out.push(".url()");
  if (field.flavour === "password") out.push(".password()");
  if (field.flavour === "numeric") out.push(".numeric()");
  if (field.options !== undefined) {
    // `OptionsInput` is a list of `{ value, label }` or a record — not a list
    // of strings. The record form reads best for an enum: the value is what is
    // stored, the label is what a human sees, and both are visible on one line.
    const pairs = field.options.map((value) => `"${value}": "${value}"`).join(", ");
    out.push(`.options({ ${pairs} })`);
  }
  if (field.maxLength !== undefined) out.push(`.maxLength(${String(field.maxLength)})`);
  if (field.required) out.push(".required()");
  if (field.unique) out.push(".unique()");
  // `dehydrated(false)` is what a password field needs: left blank, it must not
  // overwrite the stored hash with an empty string.
  if (field.dehydrateWhenEmpty === false) out.push(".dehydrated(false)");
  if (field.helperText !== undefined) {
    out.push(`.helperText(${JSON.stringify(field.helperText)})`);
  }

  return out.join("");
}
