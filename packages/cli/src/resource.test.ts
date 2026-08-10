/**
 * PRD 10 §5.2 is the bar: `perch resource User` produces a file that compiles,
 * passes the lint and works with no editing. These assert the shape; the
 * compiling half is `generated.test.ts`, which runs the real compiler over it.
 */
import { describe, expect, it } from "vitest";
import type { FieldMeta, Ir, ModelMeta, RelationMeta } from "@perchjs/core";
import { generateResource, slugOf } from "./resource.js";

function field(name: string, over: Partial<FieldMeta> = {}): FieldMeta {
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

const COUNTRY: ModelMeta = {
  name: "Country",
  dbName: "Country",
  primaryKey: field("id", { type: "Int", isId: true, isUnique: true }),
  fields: [field("id", { type: "Int", isId: true, isUnique: true }), field("name")],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "name",
};

const country: RelationMeta = {
  name: "country",
  type: "one",
  targetModel: "Country",
  foreignKeyFields: ["countryId"],
  referencedFields: ["id"],
  isRequired: false,
  isList: false,
};

const USER: ModelMeta = {
  name: "User",
  dbName: "users",
  primaryKey: field("id", { type: "Int", isId: true, isUnique: true }),
  fields: [
    field("id", { type: "Int", isId: true, isUnique: true }),
    field("email", { isUnique: true, maxLength: 255 }),
    field("name", { isRequired: false, maxLength: 120 }),
    field("password"),
    field("updatedAt", { type: "DateTime", isReadOnly: true }),
    field("deletedAt", { type: "DateTime", isRequired: false }),
    field("countryId", { type: "Int", isRequired: false }),
  ],
  relations: [country],
  uniqueConstraints: [["id"], ["email"]],
  hasSoftDelete: true,
  labelField: "name",
};

const IR: Ir = { models: [USER, COUNTRY] };
const generated = generateResource(IR, "User");

describe("where it lands", () => {
  it("writes under src/admin/resources, named after the model", () => {
    expect(generated.path).toBe("src/admin/resources/user.resource.ts");
  });

  it("hyphenates a camel-cased model", () => {
    expect(slugOf("OrderLine")).toBe("order-line");
    expect(slugOf("User")).toBe("user");
  });

  it("says which model it is missing rather than writing an empty file", () => {
    expect(() => generateResource(IR, "Ghost")).toThrow(/no model named Ghost/);
  });
});

describe("what it writes", () => {
  it("names the model and leaves the slug to the framework", () => {
    // `@PanelResource` derives `users` from the model. Writing `slug: "user"`
    // here — which the first draft did — overrides that with a different
    // convention, and the panel's URL stops matching its own default.
    expect(generated.contents).toContain('@PanelResource({ model: "User" })');
    expect(generated.contents).not.toContain("slug:");
    expect(generated.contents).toContain("export class UserResource {");
  });

  it("spells out what the schema already knows", () => {
    // PRD 10 §2.2: immediately good, not an empty skeleton. None of this is a
    // guess — every call answers a piece of metadata the IR carries.
    expect(generated.contents).toContain(
      'TextInput.make("email").email().maxLength(255).required().unique(),',
    );
    expect(generated.contents).toContain('TextInput.make("name").maxLength(120),');
    expect(generated.contents).toContain(".password()");
    // A password left blank must not overwrite the stored hash with "".
    expect(generated.contents).toContain(".dehydrated(false)");
  });

  it("turns a to-one relation into a select on the target's label", () => {
    expect(generated.contents).toContain(
      'Select.make("country").relationship("country", "name"),',
    );
  });

  it("comments an excluded field where it would have been, with the reason", () => {
    // `inferModel` returns them on purpose. Showing them commented is more
    // useful than pretending the column does not exist.
    expect(generated.contents).toContain("// id — not offered: identifier");
    expect(generated.contents).toContain("// updatedAt — not offered: read-only");
    expect(generated.contents).toContain("// deletedAt — not offered: soft-delete");
  });

  it("never writes a foreign key, which the relation already carries", () => {
    expect(generated.contents).not.toContain("countryId");
  });

  it("never puts a password in the table", () => {
    // Third time this default has reached for one in this project: the
    // adapter's search and the route's sort allowlist were narrowed for the
    // same reason. A column is read by a human, and nobody reads a hash.
    expect(generated.contents).not.toContain('TextColumn.make("password")');
  });

  it("gives the table columns, both actions and an order to open on", () => {
    expect(generated.contents).toContain('TextColumn.make("name").sortable(),');
    expect(generated.contents).toContain(".actions([EditAction.make()])");
    expect(generated.contents).toContain(".headerActions([CreateAction.make()])");
    expect(generated.contents).toContain('.defaultSort("name")');
  });

  it("imports exactly the components it used", () => {
    const imports = generated.contents.slice(0, generated.contents.indexOf("}"));

    expect(imports).toContain("TextInput");
    expect(imports).toContain("Select");
    // Nothing it did not reach for: an unused import fails the project's lint,
    // and §5.2 asks for a file that passes it.
    expect(imports).not.toContain("Toggle");
    expect(imports).not.toContain("DateTimePicker");
  });
});
