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
      maxSize: 1000,
      acceptedFileTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
    });
  });

  it("keeps the disk and the directory to itself: both are the server's", async () => {
    const made = FileUpload.make("cover").disk("s3").directory("covers");
    const payload = serialise(await tree(made));

    // Asserted against the whole payload rather than one field of it. The
    // earlier version read a property off `props`, which only existed because
    // the disk was in it — so it could not have failed if the directory had
    // started crossing on its own.
    expect(JSON.stringify(payload)).not.toContain("covers");
    expect(JSON.stringify(payload)).not.toContain("s3");
  });
});

describe("where a stored file can be looked at", () => {
  type Answer = (disk: string, key: string) => string | undefined;

  // Resolved from the row, so every case here has to say what the row holds.
  const shown = async (
    record: Record<string, unknown>,
    state: Record<string, unknown>,
    fileUrl?: Answer,
  ) =>
    serialise(
      await resolveSchema(Schema.make([FileUpload.make("cover").disk("s3")]), state, {
        operation: "edit",
        record,
        ...(fileUrl === undefined ? {} : { fileUrl }),
      }),
    ).schema.children?.[0]?.props?.["previewUrl"];

  const KEY = "covers/1.png";
  const ROW = { cover: KEY };

  it("is what the adapter says, asked with the disk the field named", async () => {
    const asked: string[][] = [];
    const answer = (disk: string, key: string): string => {
      asked.push([disk, key]);
      return `https://cdn/${key}`;
    };

    expect(await shown(ROW, { cover: KEY }, answer)).toBe(`https://cdn/${KEY}`);
    // The disk is the field's, not a default: a panel with two disks resolves
    // each field against its own.
    expect(asked).toEqual([["s3", KEY]]);
  });

  it("is absent when nobody can answer", async () => {
    expect(await shown(ROW, { cover: KEY })).toBeUndefined();
  });

  it("is absent when the row holds nothing", async () => {
    expect(await shown({ cover: "" }, { cover: "" }, () => "u")).toBeUndefined();
    expect(await shown({}, {}, () => "u")).toBeUndefined();
  });

  it("is absent when the adapter declines rather than a broken address", async () => {
    // A field naming a disk the panel was never given. No picture beats one
    // that cannot load.
    expect(await shown(ROW, { cover: KEY }, () => undefined)).toBeUndefined();
  });

  it("is never minted for a key the form was handed rather than the row", async () => {
    // The whole reason it is resolved from the row. An adapter that signs URLs
    // would otherwise sign one for wherever this page said to look.
    expect(
      await shown(ROW, { cover: "../../someone-elses/backup.sql" }, (_, key) => key),
    ).toBeUndefined();
  });

  it("stops showing the old file the moment another is chosen", async () => {
    // The form holds a staged key now. The row's picture is about to stop being
    // true, and the browser has the new file in hand to show instead.
    expect(await shown(ROW, { cover: "staging/7-new.png" }, (_, key) => key)).toBe(
      undefined,
    );
  });
});
