import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { FileUpload } from "./file-upload.js";

const tree = (made = FileUpload.make("cover")) =>
  resolveSchema(Schema.make([made]), {}, { operation: "create" });

describe("what a media type list matches", () => {
  it("a type it named exactly", () => {
    expect(
      FileUpload.make("c").acceptedFileTypes(["image/png"]).accepts("image/png"),
    ).toBe(true);
  });

  it("nothing else", () => {
    expect(
      FileUpload.make("c").acceptedFileTypes(["image/png"]).accepts("image/gif"),
    ).toBe(false);
  });

  it("a whole family where one was named", () => {
    const field = FileUpload.make("c").acceptedFileTypes(["image/*"]);

    expect(field.accepts("image/webp")).toBe(true);
    expect(field.accepts("application/pdf")).toBe(false);
  });

  it("a family and not a prefix of another one", () => {
    // `image/*` must not take `imagery/thing`, which shares its first letters
    // and none of its meaning.
    expect(
      FileUpload.make("c").acceptedFileTypes(["image/*"]).accepts("imagery/x"),
    ).toBe(false);
  });

  it("anything at all where the field named none", () => {
    expect(FileUpload.make("c").accepts("application/octet-stream")).toBe(true);
  });

  it("the common images, where `.image()` was asked for", () => {
    const field = FileUpload.make("c").image();

    expect(field.accepts("image/png")).toBe(true);
    expect(field.accepts("image/svg+xml")).toBe(false);
  });
});

describe("what the field may hold", () => {
  it("a key the route issued, and nothing else", async () => {
    const built = await tree();

    expect(sanitize(built, { cover: "staging/1" }).state).toEqual({
      cover: "staging/1",
    });
    expect(sanitize(built, { cover: { key: "staging/1" } }).rejected).toEqual([
      { path: "cover", reason: "wrong-shape" },
    ]);
  });

  it("and lets itself be cleared", async () => {
    expect(sanitize(await tree(), { cover: "" }).state).toEqual({ cover: "" });
  });
});

describe("a list of types that could match nothing", () => {
  it("stops the boot when it is empty", () => {
    const empty = FileUpload.make("cover").acceptedFileTypes([]);

    expect(auditSchema(Schema.make([empty]))).toEqual([
      {
        field: "cover",
        problem: "accepts an empty list of media types, so it would refuse every file",
      },
    ]);
  });

  it("stops it for a pattern that is not a media type", () => {
    const wrong = FileUpload.make("cover").acceptedFileTypes(["png"]);

    expect(auditSchema(Schema.make([wrong]))[0]?.problem).toContain(
      "is not a media type",
    );
  });

  it("names a bare star, which is the absence of a rule dressed as one", () => {
    expect(
      auditSchema(Schema.make([FileUpload.make("cover").acceptedFileTypes(["*"])])),
    ).toHaveLength(1);
  });

  it("says nothing about a list that can match", () => {
    const right = FileUpload.make("cover").acceptedFileTypes([
      "image/*",
      "application/pdf",
    ]);

    expect(auditSchema(Schema.make([right]))).toEqual([]);
  });
});

describe("on the wire", () => {
  it("carries what the control has to show and enforce twice", async () => {
    const made = FileUpload.make("cover").disk("s3").maxSize(1000).image();
    const payload = serialise(await tree(made));

    expect(payload.schema.children?.[0]?.props).toEqual({
      disk: "s3",
      maxSize: 1000,
      acceptedFileTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
    });
  });

  it("keeps the directory to itself, which is the server's business", async () => {
    const made = FileUpload.make("cover").directory("covers");
    const payload = serialise(await tree(made));

    expect(payload.schema.children?.[0]?.props).not.toHaveProperty("directory");
  });
});
