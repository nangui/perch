/**
 * The one route whose body is not JSON.
 *
 * Half of these are about what it refuses, and about which refusals say what.
 * A file the reader chose gets a message they can act on — it is too big, it is
 * the wrong sort — because they have to be able to choose another. The form
 * itself gets nothing: a path that is not an upload, a field they may not
 * write, and a disk that is not there all answer the same 404 as a resource
 * that does not exist.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { IncomingFile, Schema, StagedFile, StorageAdapter } from "@perchjs/core";
import { FileUpload, Schema as Tree, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { UPLOAD_CEILING_BYTES } from "./panel-upload.controller.js";

let staged: IncomingFile[] = [];
let removed: string[] = [];

class MemoryDisk implements StorageAdapter {
  stage(file: IncomingFile): Promise<StagedFile> {
    staged.push(file);
    return Promise.resolve({
      key: `staging/${String(staged.length)}`,
      name: file.name,
      size: file.bytes.byteLength,
      type: file.type,
    });
  }
  commit(key: string, directory: string): Promise<string> {
    return Promise.resolve(`${directory}/${key}`);
  }
  remove(keys: readonly string[]): Promise<void> {
    removed.push(...keys);
    return Promise.resolve();
  }
  url(key: string): string {
    return `/files/${key}`;
  }
  sweepStaged(): Promise<number> {
    return Promise.resolve(0);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Tree.make([
      TextInput.make("title"),
      FileUpload.make("cover").image().maxSize(1000),
      FileUpload.make("brief"),
      FileUpload.make("locked").readOnly(),
      FileUpload.make("proof").visible(({ get }) => get("kind") === "image"),
      TextInput.make("kind"),
    ]);
  }
}

@PanelResource({ model: "Post", slug: "closed" })
class ClosedResource {
  readonly can = { create: () => false, edit: () => false, view: () => false };
  form(): Schema {
    return Tree.make([FileUpload.make("cover")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-upload-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication;
let url: string;

beforeEach(async () => {
  staged = [];
  removed = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource, ClosedResource],
        disks: { default: new MemoryDisk() },
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterEach(async () => {
  await app.close();
});

async function send(
  path: string,
  file: { name: string; type: string; bytes: number } | null,
  slug = "posts",
  state?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.set("path", path);
  if (state !== undefined) form.set("state", JSON.stringify(state));
  if (file !== null) {
    form.set(
      "file",
      new Blob([new Uint8Array(file.bytes)], { type: file.type }),
      file.name,
    );
  }
  const response = await fetch(`${url}/admin/api/${slug}/upload`, {
    method: "POST",
    body: form,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

const SMALL = { name: "cover.png", type: "image/png", bytes: 10 };

describe("a file the field accepts", () => {
  it("goes to the staging prefix and answers with its key", async () => {
    const { status, body } = await send("cover", SMALL);

    expect(status).toBe(200);
    expect(body["file"]).toEqual({
      key: "staging/1",
      name: "cover.png",
      size: 10,
      type: "image/png",
    });
  });

  it("hands the adapter what arrived, and nothing it invented", async () => {
    await send("cover", SMALL);

    expect(staged).toHaveLength(1);
    expect(staged[0]?.name).toBe("cover.png");
    expect(staged[0]?.type).toBe("image/png");
    expect(staged[0]?.bytes.byteLength).toBe(10);
  });

  it("takes any type where the field named none", async () => {
    const { status } = await send("brief", {
      name: "brief.pdf",
      type: "application/pdf",
      bytes: 10,
    });

    expect(status).toBe(200);
  });
});

describe("a file the field refuses", () => {
  it("says it is too big, with the limit", async () => {
    // The reader chose it and has to be able to choose another.
    const { status, body } = await send("cover", { ...SMALL, bytes: 2000 });

    expect(status).toBe(422);
    expect(body["message"]).toBe("That file is 2000 bytes, and the limit is 1000.");
    expect(staged).toEqual([]);
  });

  it("says it is the wrong sort, naming the sort", async () => {
    const { status, body } = await send("cover", {
      name: "brief.pdf",
      type: "application/pdf",
      bytes: 10,
    });

    expect(status).toBe(422);
    expect(body["message"]).toBe("Files of type application/pdf are not accepted.");
    expect(staged).toEqual([]);
  });

  it("says a file was expected when none came", async () => {
    const { status, body } = await send("cover", null);

    expect(status).toBe(422);
    expect(body["message"]).toBe("No file was sent.");
  });

  it("keeps the limit against a size the browser could have lied about", async () => {
    // `accept` filters a dialog and a size check in the page is a courtesy.
    // Neither survives a post straight here, which is the only reason these
    // checks are in this file at all.
    const { status } = await send("cover", { ...SMALL, bytes: 1001 });

    expect(status).toBe(422);
  });
});

describe("what it refuses in silence", () => {
  it("a path that names no upload field", async () => {
    expect((await send("title", SMALL)).status).toBe(404);
  });

  it("a path that names nothing at all", async () => {
    expect((await send("nothing", SMALL)).status).toBe(404);
  });

  it("a field the form will not let them write", async () => {
    expect((await send("locked", SMALL)).status).toBe(404);
  });

  // A form naming a disk the panel was not given no longer boots, so the
  // route's own guard against one cannot be reached from a running panel. It
  // stays, because the route does not get to assume the audit ran, and the case
  // is covered where it is now reachable — in the registry's tests.

  it("a resource the principal may not reach", async () => {
    expect((await send("cover", SMALL, "closed")).status).toBe(404);
  });

  it("a resource that does not exist", async () => {
    expect((await send("cover", SMALL, "ghosts")).status).toBe(404);
  });

  it("and says the same thing about every one of them", async () => {
    const answers = await Promise.all([
      send("title", SMALL),
      send("nothing", SMALL),
      send("locked", SMALL),
      send("cover", SMALL, "ghosts"),
    ]);

    expect(answers.map((one) => one.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((one) => String(one.body["message"])))).toHaveProperty(
      "size",
      1,
    );
  });

  it("nothing reaches the disk in any of those cases", async () => {
    await send("title", SMALL);
    await send("locked", SMALL);

    expect(staged).toEqual([]);
  });
});

describe("the envelope", () => {
  it("is refused when it names no path", async () => {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(4)]), "x.png");
    const response = await fetch(`${url}/admin/api/posts/upload`, {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(404);
  });
});

describe("a field the form only shows sometimes", () => {
  it("is reachable when the state the reader has makes it visible", async () => {
    // Resolved with an empty tree it is invisible, and somebody looking
    // straight at the control would be told the field does not exist.
    const { status } = await send("proof", SMALL, "posts", { kind: "image" });

    expect(status).toBe(200);
  });

  it("is not reachable when that same state hides it", async () => {
    const { status } = await send("proof", SMALL, "posts", { kind: "text" });

    expect(status).toBe(404);
  });

  it("is not reachable when no state came at all", async () => {
    expect((await send("proof", SMALL)).status).toBe(404);
  });
});

describe("the parser's own ceiling", () => {
  it("stops reading rather than holding the whole thing first", async () => {
    // `.maxSize()` is the policy and is checked after; this is the backstop
    // that keeps an authorised route from being a way to exhaust the process.
    const { status } = await send("brief", {
      name: "huge.bin",
      type: "application/octet-stream",
      bytes: UPLOAD_CEILING_BYTES + 1,
    });

    expect(status).not.toBe(200);
    expect(staged).toEqual([]);
  });
});
