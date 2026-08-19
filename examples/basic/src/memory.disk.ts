/**
 * A storage adapter in a variable, so uploads work with no S3 and no disk.
 *
 * The same point the data adapter makes: the panel never learns which one it
 * got. A real one writes to a bucket or a folder; this one keeps the bytes in a
 * `Map` and hands back keys, which is enough to watch an upload's whole life —
 * staged on choosing, committed on saving, and dropped when the row that
 * pointed at it stopped.
 */
import { Injectable } from "@nestjs/common";
import type { IncomingFile, StagedFile, StorageAdapter } from "@perchjs/core";

interface Kept {
  readonly bytes: Uint8Array;
  readonly name: string;
  readonly type: string;
  readonly at: number;
}

@Injectable()
export class MemoryDisk implements StorageAdapter {
  readonly #files = new Map<string, Kept>();
  #next = 1;

  stage(file: IncomingFile): Promise<StagedFile> {
    const key = `staging/${String(this.#next++)}-${file.name}`;
    this.#files.set(key, {
      bytes: file.bytes,
      name: file.name,
      type: file.type,
      at: Date.now(),
    });
    return Promise.resolve({
      key,
      name: file.name,
      size: file.bytes.byteLength,
      type: file.type,
    });
  }

  commit(key: string, directory: string): Promise<string> {
    const kept = this.#files.get(key);
    if (kept === undefined) throw new Error(`nothing staged under ${key}`);

    const final = `${directory === "" ? "files" : directory}/${key.replace("staging/", "")}`;
    this.#files.set(final, kept);
    this.#files.delete(key);
    return Promise.resolve(final);
  }

  remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.#files.delete(key);
    return Promise.resolve();
  }

  url(key: string): string {
    return `/files/${key}`;
  }

  sweepStaged(olderThan: Date): Promise<number> {
    let dropped = 0;
    for (const [key, kept] of this.#files) {
      if (!key.startsWith("staging/") || kept.at >= olderThan.getTime()) continue;
      this.#files.delete(key);
      dropped += 1;
    }
    return Promise.resolve(dropped);
  }

  /**
   * What `url()` promised, so the promise is kept.
   *
   * The adapter port has no read: serving files is the host's job, and a bucket
   * serves its own. This one keeps bytes in a `Map`, so the example serves them
   * — otherwise `url()` names an address nothing answers at, and the preview it
   * was added for is a broken image.
   */
  read(key: string): { bytes: Uint8Array; type: string } | undefined {
    const kept = this.#files.get(key);
    return kept === undefined ? undefined : { bytes: kept.bytes, type: kept.type };
  }

  /** For the example's own sake: what is in there right now. */
  keys(): readonly string[] {
    return [...this.#files.keys()];
  }
}
