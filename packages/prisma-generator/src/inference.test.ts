/**
 * Inference over the real path: DMMF → IR → inferred field. The engine lives in
 * `@perchjs/core`, but the fixture lives here, and core cannot import an
 * adapter. Testing it from this side makes it an end-to-end assertion rather
 * than a unit test on hand-built metadata.
 */
import { describe, expect, it } from "vitest";
import type { InferredField } from "@perchjs/core";
import {
  findField,
  findModel,
  findRelation,
  inferField,
  inferModel,
  inferRelation,
} from "@perchjs/core";
import { readDmmf } from "./dmmf-reader.js";
import { FIXTURE_DMMF } from "./__fixtures__/dmmf.js";

const ir = readDmmf(FIXTURE_DMMF);
const User = findModel(ir, "User")!;
const Post = findModel(ir, "Post")!;
const Product = findModel(ir, "Product")!;

function infer(model: typeof User, name: string): InferredField {
  return inferField(findField(model, name)!);
}

describe("email needs no configuration", () => {
  it("infers required, email and maxLength 255 from the schema alone", () => {
    expect(infer(User, "email")).toMatchObject({
      component: "TextInput",
      flavour: "email",
      required: true,
      unique: true,
      maxLength: 255,
      helperText: "Used to sign in. Must be unique.",
    });
  });
});

describe("inferField — by declared metadata", () => {
  it("maps Boolean to a toggle", () => {
    expect(infer(User, "isActive").component).toBe("Toggle");
  });

  it("maps @db.Text to a textarea rather than a text input", () => {
    expect(infer(User, "bio").component).toBe("Textarea");
  });

  it("maps an enum to a select carrying its values", () => {
    expect(infer(User, "role")).toMatchObject({
      component: "Select",
      options: ["ADMIN", "EDITOR", "VIEWER"],
    });
  });

  it("maps Decimal to a numeric input with precision and scale", () => {
    expect(infer(Product, "price")).toMatchObject({
      component: "TextInput",
      flavour: "numeric",
      precision: 10,
      scale: 2,
    });
  });

  it("maps Int and Float to numeric inputs", () => {
    expect(infer(Product, "stock").flavour).toBe("numeric");
    expect(infer(Product, "weightKg").flavour).toBe("numeric");
  });

  it("maps Json to a code editor until KeyValue lands in v0.2", () => {
    expect(infer(User, "preferences").component).toBe("CodeEditor");
  });

  it("does not require a field that carries a default", () => {
    // The database fills it, so demanding it from the user would be wrong.
    expect(infer(User, "isActive").required).toBe(false);
    expect(infer(Product, "stock").required).toBe(false);
    expect(infer(User, "passwordHash").required).toBe(true);
  });

  it("does not require an optional field", () => {
    expect(infer(User, "name").required).toBe(false);
  });
});

describe("inferField — by name, and the switch that turns it off", () => {
  it("infers a password input that does not overwrite the hash when left blank", () => {
    expect(infer(User, "passwordHash")).toMatchObject({
      flavour: "password",
      dehydrateWhenEmpty: false,
    });
  });

  it("infers a url input from the field name", () => {
    expect(infer(User, "websiteUrl").flavour).toBe("url");
  });

  it("infers a date-only picker when the name ends in Date or On", () => {
    expect(infer(User, "birthDate")).toMatchObject({
      component: "DateTimePicker",
      dateOnly: true,
    });
    expect(infer(Post, "publishedOn").dateOnly).toBe(true);
  });

  it("keeps time when the name says nothing about it", () => {
    // The component is asserted too, and it is the point: `dateOnly` reads
    // undefined both when a field reached the date inference and kept its time,
    // and when it never got there at all. This test used `createdAt` until that
    // became read-only and returned early, at which point it passed while
    // testing nothing.
    const deletedAt = inferField(findField(User, "deletedAt")!);

    expect(deletedAt.component).toBe("DateTimePicker");
    expect(deletedAt.dateOnly).toBeUndefined();
  });

  it("strict mode drops every name-based guess, keeping declared metadata", () => {
    const strict = { strict: true };
    expect(inferField(findField(User, "email")!, strict).flavour).toBe("text");
    expect(inferField(findField(User, "passwordHash")!, strict).flavour).toBe("text");
    expect(inferField(findField(User, "birthDate")!, strict).dateOnly).toBeUndefined();
    // Declared metadata survives: maxLength comes from @db.VarChar, not the name.
    expect(inferField(findField(User, "email")!, strict).maxLength).toBe(255);
    expect(inferField(findField(User, "bio")!, strict).component).toBe("Textarea");
  });
});

describe("inferField — what is kept out of a form", () => {
  it("excludes the identifier", () => {
    expect(infer(User, "id").excludedFromForm).toBe("identifier");
  });

  it("excludes what the database owns, and offers what it merely defaults", () => {
    expect(infer(User, "updatedAt").excludedFromForm).toBe("read-only");
    expect(infer(User, "createdAt").excludedFromForm).toBe("read-only");
    expect(infer(User, "isActive").excludedFromForm).toBeUndefined();
  });
});

describe("inferRelation", () => {
  it("infers a select on the target's label field for a to-one relation", () => {
    expect(inferRelation(findRelation(Post, "author")!, ir)).toMatchObject({
      component: "Select",
      required: true,
      relationship: { model: "User", labelField: "name" },
    });
  });

  it("keeps a to-many relation out of the form", () => {
    expect(inferRelation(findRelation(Post, "comments")!, ir)).toMatchObject({
      excludedFromForm: "to-many-relation",
    });
  });

  it("does not require an optional to-one relation", () => {
    expect(inferRelation(findRelation(Post, "category")!, ir).required).toBe(false);
  });
});

describe("inferModel", () => {
  const inferred = inferModel(Post, ir);
  const names = inferred.map((f) => f.name);

  it("represents a foreign key by its relation and never twice", () => {
    // Offering both `authorId` and `author` is the classic generated-admin bug:
    // two controls writing the same column.
    expect(names).toContain("author");
    expect(names).not.toContain("authorId");
    expect(names).not.toContain("categoryId");
  });

  it("returns excluded fields too, carrying their reason", () => {
    const excluded = inferred.filter((f) => f.excludedFromForm !== undefined);
    expect(excluded.map((f) => f.name)).toContain("id");
    expect(excluded.map((f) => f.name)).toContain("comments");
  });

  it("keeps the soft-delete tombstone out of the form", () => {
    // A date picker on `deletedAt` deletes the row. It is not read-only —
    // nothing generates the value — so it needs a reason of its own.
    const user = inferModel(User, ir);
    const deletedAt = user.find((f) => f.name === "deletedAt");

    expect(User.hasSoftDelete).toBe(true);
    expect(deletedAt?.excludedFromForm).toBe("soft-delete");
    // And nothing else. A condition that tested `hasSoftDelete` and forgot the
    // name would empty the form of a soft-deleting model, silently.
    expect(
      user.filter((f) => f.excludedFromForm === "soft-delete").map((f) => f.name),
    ).toEqual(["deletedAt"]);
  });

  it("leaves the same column editable when the model does not soft-delete", () => {
    // Configuration says this is an ordinary date on this model, so it is one.
    const plain = readDmmf(FIXTURE_DMMF, { softDelete: { User: false } });
    const model = findModel(plain, "User")!;
    const deletedAt = inferModel(model, plain).find((f) => f.name === "deletedAt");

    expect(deletedAt?.excludedFromForm).toBeUndefined();
    expect(deletedAt?.component).toBe("DateTimePicker");
  });

  it("covers every model of the fixture without throwing", () => {
    for (const model of ir.models) {
      expect(inferModel(model, ir).length, model.name).toBeGreaterThan(0);
    }
  });
});

describe("the bootstrap budget", () => {
  it("reads the schema and infers every model well under 200 ms", () => {
    const started = performance.now();
    for (let i = 0; i < 4; i += 1) {
      const s = readDmmf(FIXTURE_DMMF);
      for (const model of s.models) inferModel(model, s);
    }
    const perRun = (performance.now() - started) / 4;
    // The criterion is 50 models; the fixture has 12, so the budget is scaled
    // down rather than pretending this measures the real target.
    expect(perRun).toBeLessThan(200 * (12 / 50));
  });
});
