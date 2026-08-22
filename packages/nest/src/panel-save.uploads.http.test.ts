/**
 * The row is written last, over HTTP.
 *
 * `commit-uploads.test.ts` pins the ordering as a function; this pins it as a
 * save, because the order only matters where the two writes actually happen.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Row,
  Schema,
  StagedFile,
  StorageAdapter,
  WriteTree,
} from "@perchjs/core";
import { FileUpload, Schema as Tree, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

let events: string[] = [];
let refuseWrite = false;

class Disk implements StorageAdapter {
  stage(): Promise<StagedFile> {
    throw new Error("not needed here");
  }
  commit(key: string, directory: string): Promise<string> {
    events.push(`commit ${key}`);
    return Promise.resolve(`${directory}/${key.replace("staging/", "")}`);
  }
  remove(keys: readonly string[]): Promise<void> {
    events.push(`remove ${keys.join(",")}`);
    return Promise.resolve();
  }
  url(key: string): string {
    return key;
  }
  sweepStaged(): Promise<number> {
    return Promise.resolve(0);
  }
}

const ROW: Row = { id: 1, title: "Old", cover: "covers/old" };

class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [] };
  }
  meta(): ModelMeta {
    return {
      name: "Post",
      primaryKey: { name: "id", type: "Int" },
    } as unknown as ModelMeta;
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: [], total: 0 });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(id === 1 ? ROW : null);
  }
  create(_model: string, data: WriteTree): Promise<Row> {
    if (refuseWrite) {
      events.push("write failed");
      throw new Error("the database said no");
    }
    events.push(`wrote ${String(data.set?.["cover"])}`);
    return Promise.resolve({ id: 2 });
  }
  update(_model: string, _id: Id, data: WriteTree): Promise<Row> {
    if (refuseWrite) {
      events.push("write failed");
      throw new Error("the database said no");
    }
    events.push(`wrote ${String(data.set?.["cover"])}`);
    return Promise.resolve({ id: 1 });
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  /** Not exercised here: a double that answered zero would let a test
   * pass with nothing having happened. */
  forceDelete(): Promise<number> {
    throw new Error("not needed here");
  }
  restore(): Promise<number> {
    throw new Error("not needed here");
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@PanelResource({ model: "Post", slug: "posts" })
class PostResource {
  form(): Schema {
    return Tree.make([
      TextInput.make("title"),
      FileUpload.make("cover").directory("covers"),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-save-up-"));
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
  events = [];
  refuseWrite = false;
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        disks: { default: new Disk() },
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

const save = async (
  path: string,
  method: string,
  state: Record<string, unknown>,
): Promise<number> => {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return response.status;
};

describe("creating a row with an attachment", () => {
  it("moves the file, then writes the row, in that order", async () => {
    await save("/admin/api/posts", "POST", { title: "Ada", cover: "staging/9" });

    expect(events).toEqual(["commit staging/9", "wrote covers/9"]);
  });

  it("writes the final key, never the staging one", async () => {
    await save("/admin/api/posts", "POST", { title: "Ada", cover: "staging/9" });

    expect(events).toContain("wrote covers/9");
  });
});

describe("a write that fails after the file moved", () => {
  it("takes the file back out", async () => {
    // No row landed, so nothing points at it. The alternative order leaves a
    // row pointing at a file that is not there.
    refuseWrite = true;
    await save("/admin/api/posts", "POST", { title: "Ada", cover: "staging/9" });

    expect(events).toEqual(["commit staging/9", "write failed", "remove covers/9"]);
  });
});

describe("replacing an attachment", () => {
  it("drops the old one only after the row stopped pointing at it", async () => {
    await save("/admin/api/posts/1", "PATCH", { title: "Ada", cover: "staging/9" });

    expect(events).toEqual(["commit staging/9", "wrote covers/9", "remove covers/old"]);
  });

  it("keeps the old one when the write failed", async () => {
    // The row still points at it, and removing it would break the record that
    // survived.
    refuseWrite = true;
    await save("/admin/api/posts/1", "PATCH", { title: "Ada", cover: "staging/9" });

    expect(events).toEqual(["commit staging/9", "write failed", "remove covers/9"]);
  });
});
