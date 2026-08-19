/**
 * The outbound port for bytes, as `DataAdapter` is for rows.
 *
 * A disk is named, never described: `.disk("uploads")` picks among what the
 * panel was given, and what is behind the name — a directory, a bucket, a
 * signed URL — is the host's business and never the form's.
 *
 * A file goes up when it is chosen, to a staging prefix, and the save commits
 * it. So the two halves are separate calls rather than one `put`: between them
 * sits a reader who may close the tab, and the difference between a file that
 * was abandoned and one that belongs is the whole of the cleanup story.
 *
 * Bytes cross as a `Uint8Array` rather than a stream because this package is
 * built against `ES2023` and nothing else — no DOM, no Node — and a stream type
 * would come from one of them. `.maxSize()` is what keeps that honest, and a
 * streaming variant can be added beside it without changing any of this.
 */

/** What arrived, before anything has been kept. */
export interface IncomingFile {
  /** What the reader called it. Never used as a path. */
  readonly name: string;
  /** As the browser reported it, which is a claim and not a fact. */
  readonly type: string;
  readonly bytes: Uint8Array;
}

/** What was kept, and how to speak about it afterwards. */
export interface StagedFile {
  /** The adapter's own name for it. Opaque here, and the form's value. */
  readonly key: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface StorageAdapter {
  /**
   * Takes the bytes into the staging prefix.
   *
   * Nothing here is final: a staged file is one a reader chose and may never
   * save, so it must be distinguishable from one that belongs.
   */
  stage(file: IncomingFile): Promise<StagedFile>;

  /**
   * Moves a staged file to where it belongs, and answers its final key.
   *
   * Called by the save before the row is written, so a
   * failure here means no row at all rather than a row pointing at nothing.
   */
  commit(key: string, directory: string): Promise<string>;

  /** Called on the save's own failure path, and by whoever deletes a row. */
  remove(keys: readonly string[]): Promise<void>;

  /** Where a reader fetches it. A path or an absolute URL; the adapter says. */
  url(key: string): string;

  /**
   * Drops staged files older than an instant, and answers how many.
   *
   * The framework provides the sweep and the host schedules it. It covers the
   * common leftover — chosen, never saved — and by construction cannot cover a
   * committed file whose row never landed, which is found by comparing the
   * store against the column and by nothing cheaper.
   */
  sweepStaged(olderThan: Date): Promise<number>;
}
