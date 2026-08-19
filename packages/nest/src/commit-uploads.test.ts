/**
 * The order files are committed in, and what each failure leaves behind.
 */
import type { IncomingFile, StagedFile, StorageAdapter } from "@perchjs/core";
import { FileUpload, Schema, TextInput } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import { commitUploads, dropReplaced, undoCommitted } from "./commit-uploads.js";

let moved: { key: string; directory: string }[] = [];
let dropped: string[] = [];

class Disk implements StorageAdapter {
  stage(): Promise<StagedFile> {
    throw new Error("not needed here");
  }
  commit(key: string, directory: string): Promise<string> {
    moved.push({ key, directory });
    return Promise.resolve(`${directory}/${key.replace("staging/", "")}`);
  }
  remove(keys: readonly string[]): Promise<void> {
    dropped.push(...keys);
    return Promise.resolve();
  }
  url(key: string): string {
    return key;
  }
  sweepStaged(): Promise<number> {
    return Promise.resolve(0);
  }
}

const disks = { default: new Disk() };
const form = Schema.make([
  TextInput.make("title"),
  FileUpload.make("cover").directory("covers"),
]);

function fresh(): void {
  moved = [];
  dropped = [];
}

describe("a file chosen and saved", () => {
  it("moves out of staging and the value becomes its final key", async () => {
    fresh();
    const { write, committed } = await commitUploads(
      form,
      { set: { title: "Ada", cover: "staging/7" } },
      null,
      disks,
    );

    expect(moved).toEqual([{ key: "staging/7", directory: "covers" }]);
    expect(write.set?.["cover"]).toBe("covers/7");
    expect(committed.fresh).toEqual([{ disk: "default", key: "covers/7" }]);
  });

  it("leaves the values it was given alone", async () => {
    // A save refused further along must not have quietly rewritten its input.
    fresh();
    const given = { title: "Ada", cover: "staging/7" };
    await commitUploads(form, { set: given }, null, disks);

    expect(given.cover).toBe("staging/7");
  });

  it("touches nothing where the form carries no upload", async () => {
    fresh();
    const plain = Schema.make([TextInput.make("title")]);
    const { write } = await commitUploads(
      plain,
      { set: { title: "Ada" } },
      null,
      disks,
    );

    expect(moved).toEqual([]);
    expect(write.set).toEqual({ title: "Ada" });
  });
});

describe("a value that was already final", () => {
  it("is not moved again", async () => {
    // The second save of a row whose attachment nobody touched.
    fresh();
    const { write, committed } = await commitUploads(
      form,
      { set: { cover: "covers/7" } },
      { cover: "covers/7" },
      disks,
    );

    expect(moved).toEqual([]);
    expect(write.set?.["cover"]).toBe("covers/7");
    expect(committed.replaced).toEqual([]);
  });
});

describe("an attachment replaced by another", () => {
  it("is dropped, but only once the row has landed", async () => {
    fresh();
    const { committed } = await commitUploads(
      form,
      { set: { cover: "staging/9" } },
      { cover: "covers/7" },
      disks,
    );

    // Nothing has been dropped yet: the row has not been written.
    expect(dropped).toEqual([]);
    expect(committed.replaced).toEqual([{ disk: "default", key: "covers/7" }]);

    await dropReplaced(committed, disks);
    expect(dropped).toEqual(["covers/7"]);
  });

  it("is dropped when the field is cleared rather than replaced", async () => {
    fresh();
    const { committed } = await commitUploads(
      form,
      { set: { cover: "" } },
      { cover: "covers/7" },
      disks,
    );

    await dropReplaced(committed, disks);
    expect(dropped).toEqual(["covers/7"]);
  });
});

describe("a row that never landed", () => {
  it("takes the files this save had moved with it", async () => {
    fresh();
    const { committed } = await commitUploads(
      form,
      { set: { cover: "staging/9" } },
      null,
      disks,
    );

    await undoCommitted(committed, disks);
    expect(dropped).toEqual(["covers/9"]);
  });

  it("leaves the old one alone, because the row still points at it", async () => {
    fresh();
    const { committed } = await commitUploads(
      form,
      { set: { cover: "staging/9" } },
      { cover: "covers/7" },
      disks,
    );

    await undoCommitted(committed, disks);
    expect(dropped).toEqual(["covers/9"]);
  });

  it("does not throw when the undo itself fails", async () => {
    // The original failure is the one worth reporting; what is left is the
    // a staged file the sweep collects.
    fresh();
    // Written out rather than spread from an instance: spreading a class keeps
    // no prototype, so the methods this does not name would simply be absent —
    // and the test would pass only for as long as nothing called them.
    const angry: Record<string, StorageAdapter> = {
      default: {
        stage: () => Promise.reject(new Error("not needed here")),
        commit: (key: string, directory: string) =>
          Promise.resolve(`${directory}/${key}`),
        remove: () => Promise.reject(new Error("store is down")),
        url: (key: string) => key,
        sweepStaged: () => Promise.resolve(0),
      },
    };
    const { committed } = await commitUploads(
      form,
      { set: { cover: "staging/9" } },
      null,
      angry,
    );

    await expect(undoCommitted(committed, angry)).resolves.toBeUndefined();
  });
});

describe("a disk the panel does not have", () => {
  it("is left alone rather than guessed at", async () => {
    // The boot audit is what stops this reaching here; nothing downstream gets
    // to invent a store.
    fresh();
    const elsewhere = Schema.make([FileUpload.make("cover").disk("s3")]);
    const { write } = await commitUploads(
      elsewhere,
      { set: { cover: "staging/1" } },
      null,
      disks,
    );

    expect(moved).toEqual([]);
    expect(write.set?.["cover"]).toBe("staging/1");
  });
});

describe("an IncomingFile", () => {
  it("is what the port takes, and never what this file passes", () => {
    // A type-level note: this module only ever moves keys. Bytes belong to the
    // upload route, which is the only place they exist at all.
    const shape: IncomingFile = {
      name: "x",
      type: "image/png",
      bytes: new Uint8Array(),
    };

    expect(shape.bytes.byteLength).toBe(0);
  });
});
