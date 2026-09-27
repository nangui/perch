/**
 * The contract, against one adapter that keeps it and several that do not.
 *
 * A suite of checks is worth what it catches, so each fault below is a way an
 * adapter can be written wrong by somebody reading the interface reasonably:
 * keeping staged and committed files in one place, answering a count that is
 * not what was dropped, taking the instant as advice. Each has to be caught by
 * name, or the check that was supposed to catch it is decoration.
 */
import type { IncomingFile, StagedFile, StorageAdapter } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import { checkStorageAdapter } from "./storage.js";

/** An adapter that keeps the contract, and the base the broken ones bend. */
class Disk implements StorageAdapter {
  protected readonly held = new Map<string, { bytes: Uint8Array; at: Date }>();
  #next = 0;

  stage(file: IncomingFile): Promise<StagedFile> {
    const key = `staging/${String((this.#next += 1))}`;
    this.held.set(key, { bytes: file.bytes, at: new Date() });
    return Promise.resolve({
      key,
      name: file.name,
      size: file.bytes.byteLength,
      type: file.type,
    });
  }

  commit(key: string, directory: string): Promise<string> {
    const found = this.held.get(key);
    if (found === undefined) throw new Error(`nothing staged at ${key}`);
    const to = `${directory}/${key.replace("staging/", "")}`;
    this.held.set(to, found);
    this.held.delete(key);
    return Promise.resolve(to);
  }

  remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.held.delete(key);
    return Promise.resolve();
  }

  url(key: string): string {
    return `/files/${key}`;
  }

  sweepStaged(olderThan: Date): Promise<number> {
    let dropped = 0;
    for (const [key, file] of [...this.held]) {
      if (!key.startsWith("staging/") || file.at >= olderThan) continue;
      this.held.delete(key);
      dropped += 1;
    }
    return Promise.resolve(dropped);
  }
}

const complaints = async (adapter: StorageAdapter): Promise<readonly string[]> =>
  await checkStorageAdapter(adapter);

describe("an adapter that keeps the contract", () => {
  it("is told nothing", async () => {
    expect(await complaints(new Disk())).toEqual([]);
  });
});

describe("an adapter that does not", () => {
  it("is caught keeping staged and committed files in one place", async () => {
    // The fault this suite exists for: every other check passes, and the first
    // sweep after a save deletes what the reader just saved.
    class Flat extends Disk {
      override sweepStaged(olderThan: Date): Promise<number> {
        let dropped = 0;
        for (const [key, file] of [...this.held]) {
          if (file.at >= olderThan) continue;
          this.held.delete(key);
          dropped += 1;
        }
        return Promise.resolve(dropped);
      }
    }

    expect((await complaints(new Flat())).join(" ")).toContain(
      "after they were committed",
    );
  });

  it("is caught taking the instant as advice", async () => {
    class Eager extends Disk {
      override sweepStaged(): Promise<number> {
        const staged = [...this.held.keys()].filter((key) =>
          key.startsWith("staging/"),
        );
        for (const key of staged) this.held.delete(key);
        return Promise.resolve(staged.length);
      }
    }

    expect((await complaints(new Eager())).join(" ")).toContain("not old enough");
  });

  it("is caught answering a count that is not what it dropped", async () => {
    class Silent extends Disk {
      override async sweepStaged(olderThan: Date): Promise<number> {
        await super.sweepStaged(olderThan);
        return 0;
      }
    }

    expect((await complaints(new Silent())).join(" ")).toContain("answered 0 for one");
  });

  it("is caught lying about the size", async () => {
    class Rounded extends Disk {
      override async stage(file: IncomingFile): Promise<StagedFile> {
        return { ...(await super.stage(file)), size: 1024 };
      }
    }

    expect((await complaints(new Rounded())).join(" ")).toContain(
      "answered 1024 bytes",
    );
  });

  it("is caught renaming what it was given", async () => {
    class Renaming extends Disk {
      override async stage(file: IncomingFile): Promise<StagedFile> {
        return { ...(await super.stage(file)), name: "upload.bin" };
      }
    }

    expect((await complaints(new Renaming())).join(" ")).toContain("renamed the file");
  });

  it("is caught having nowhere to serve a file from", async () => {
    class Hidden extends Disk {
      override url(): string {
        return "";
      }
    }

    const said = (await complaints(new Hidden())).join(" ");
    expect(said).toContain("url() of a staged file is empty");
    expect(said).toContain("url() of a committed file is empty");
  });

  it("is caught raising on a key that is not there", async () => {
    // Both the save's failure path and a deleted row can reach the same key,
    // and neither is in a position to find out first.
    class Brittle extends Disk {
      override remove(keys: readonly string[]): Promise<void> {
        for (const key of keys) {
          if (!this.held.has(key)) throw new Error(`no such key: ${key}`);
          this.held.delete(key);
        }
        return Promise.resolve();
      }
    }

    expect((await complaints(new Brittle())).join(" ")).toContain("remove() raised");
  });
});

describe("an adapter that raises", () => {
  it("is reported rather than allowed to end the run", async () => {
    // The state a wrong adapter is most likely to reach: the step after the
    // wrong one finds nothing. A stack trace out of somebody's disk is the
    // least useful thing this could hand back.
    class Angry extends Disk {
      override commit(): Promise<string> {
        throw new Error("no bucket configured");
      }
    }

    const said = await checkStorageAdapter(new Angry());

    expect(said.join(" ")).toContain("commit() raised: no bucket configured");
    expect(said.every((one) => !one.includes("Error:"))).toBe(true);
  });
});
