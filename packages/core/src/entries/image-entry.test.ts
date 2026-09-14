/**
 * A picture an infolist shows, and the address it never invents.
 *
 * What a row holds is a key on a disk. Only the host turns one into an address,
 * because only it knows the disk and only it signs for a bucket — and whatever
 * it hands back is then read like any other address, because a signed URL is
 * exactly what nobody should put in an `src` unexamined.
 *
 * A host that cannot answer means no picture. An `<img>` pointing at something
 * nobody read is worse than an empty space: the space is honest.
 */
import { describe, expect, it } from "vitest";
import { ImageEntry } from "./image-entry.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";

const drawn = async (
  entry: ImageEntry,
  record: Record<string, unknown>,
  fileUrl?: (disk: string, key: string) => string | undefined,
) =>
  serialise(
    await resolveSchema(
      Schema.make([entry]),
      {},
      {
        operation: "edit",
        record,
        ...(fileUrl === undefined ? {} : { fileUrl }),
      },
    ),
  ).schema.children?.[0];

const host = (disk: string, key: string) => `https://cdn.example/${disk}/${key}`;

describe("a key on a disk", () => {
  it("crosses as the address the host minted, never as the key", async () => {
    const node = await drawn(
      ImageEntry.make("avatar").disk("faces"),
      { avatar: "ada.png" },
      host,
    );

    expect(node?.pictures).toEqual(["https://cdn.example/faces/ada.png"]);
    // The key itself is not what a browser is given.
    expect(JSON.stringify(node)).not.toContain('"ada.png"');
  });

  it("is no picture at all where the host cannot answer", async () => {
    const node = await drawn(
      ImageEntry.make("avatar").disk("faces"),
      { avatar: "ada.png" },
      () => undefined,
    );

    expect(node?.pictures).toBeUndefined();
  });

  it("is no picture where no host was given, rather than the bare key", async () => {
    // Without a host a key is just a string, and a string in an `src` is a
    // request to somewhere nobody chose.
    const node = await drawn(ImageEntry.make("avatar").disk("faces"), {
      avatar: "ada.png",
    });

    expect(node?.pictures).toBeUndefined();
  });
});

describe("a value that is already an address", () => {
  it("crosses when it is one a browser may fetch", async () => {
    const node = await drawn(ImageEntry.make("logo"), {
      logo: "https://example.com/logo.png",
    });

    expect(node?.pictures).toEqual(["https://example.com/logo.png"]);
  });

  it("is dropped when it is one nobody should follow", async () => {
    // The same reading a link gets. A stored value reaching an attribute
    // unread is how `javascript:` becomes somebody else's script.
    const node = await drawn(ImageEntry.make("logo"), {
      logo: "javascript:alert(1)",
    });

    expect(node?.pictures).toBeUndefined();
  });
});

describe("a path holding several", () => {
  it("keeps the ones that resolved and drops the ones that did not", async () => {
    const node = await drawn(
      ImageEntry.make("gallery").disk("faces"),
      { gallery: ["a.png", "", "b.png"] },
      (disk, key) => (key === "b.png" ? undefined : host(disk, key)),
    );

    expect(node?.pictures).toEqual(["https://cdn.example/faces/a.png"]);
  });
});

describe("what it says about itself", () => {
  it("carries the shape it was told to take", async () => {
    const node = await drawn(
      ImageEntry.make("avatar").disk("faces").circular().stacked().size(64),
      { avatar: "ada.png" },
      host,
    );

    expect(node?.props).toMatchObject({ circular: true, stacked: true, size: 64 });
  });
});
