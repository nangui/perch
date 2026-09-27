/**
 * What the port for bytes asks of an adapter, run against a real one.
 *
 * `DataAdapter` has this repository's own suites standing over it. The storage
 * port has nothing: every test here brings a disk of its own, the example ships
 * another, and each is only as right as its author's reading of the interface.
 * An adapter that never distinguishes a staged file from a kept one passes every
 * test in this repository and loses a reader's uploads on the first sweep.
 *
 * So the promises are written out once, as checks, and handed back rather than
 * asserted: this package names no test runner and is not about to start. What
 * comes back is the list of disagreements, and an empty list is the adapter
 * conforming. One `it` of your own around it is the whole integration:
 *
 * ```ts
 * it("conforms", async () => {
 *   expect(await checkStorageAdapter(new MyDisk())).toEqual([]);
 * });
 * ```
 *
 * Two things it cannot check, and says so rather than pretending. Whether a
 * committed file is really where `url()` says is a question about a bucket or a
 * directory, not about this interface. And `remove()` has no observable effect
 * through the port for a file that was committed, there being nothing to ask
 * afterwards, so what is checked is that it is callable twice without raising:
 * the save's failure path and a deleted row can both reach the same key.
 */
import type { IncomingFile, StorageAdapter } from "@perchjs/core";

/** A file to stage, made here so every check starts from the same bytes. */
function file(name: string, size = 8): IncomingFile {
  return {
    name,
    type: "image/png",
    bytes: new Uint8Array(Array.from({ length: size }, (_, at) => at % 256)),
  };
}

const LATER = (): Date => new Date(Date.now() + 60_000);
const EARLIER = (): Date => new Date(Date.now() - 60_000);

/**
 * Every way an adapter can disagree with the port.
 *
 * Returns what it got wrong, one sentence each, and an empty array when it got
 * everything right. It writes to the adapter it is given, under the staging
 * prefix and one directory named below, so point it at a disk you are willing
 * to have written to.
 */
export async function checkStorageAdapter(
  adapter: StorageAdapter,
): Promise<readonly string[]> {
  const wrong: string[] = [];
  const say = (what: string): void => void wrong.push(what);

  /**
   * Runs one call, and turns a raise into a complaint.
   *
   * An adapter that is wrong is exactly the one likely to throw on the step
   * after the wrong one: a sweep that took the instant as advice leaves nothing
   * for the commit to find. Handing a reader a stack trace from inside their
   * own disk, instead of the list of what it got wrong, would make this suite
   * least useful where it is most needed.
   */
  const attempt = async <T>(
    what: string,
    run: () => Promise<T> | T,
  ): Promise<T | undefined> => {
    try {
      return await run();
    } catch (error) {
      say(`${what} raised: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const chosen = file("portrait.png");
  const staged = await attempt("stage()", () => adapter.stage(chosen));
  if (staged === undefined) return wrong;

  if (staged.key === "") say("stage() answered with an empty key.");
  if (staged.name !== chosen.name) {
    say(`stage() renamed the file: asked for ${chosen.name}, answered ${staged.name}.`);
  }
  if (staged.type !== chosen.type) {
    say(`stage() changed the type: asked for ${chosen.type}, answered ${staged.type}.`);
  }
  if (staged.size !== chosen.bytes.byteLength) {
    say(
      `stage() answered ${String(staged.size)} bytes for ${String(chosen.bytes.byteLength)}.`,
    );
  }
  const stagedUrl = await attempt("url()", () => adapter.url(staged.key));
  if (stagedUrl === "") say("url() of a staged file is empty.");

  // Nothing is due yet, so nothing may go. An adapter that ignores the instant
  // it is given passes every other check here and deletes what a reader is in
  // the middle of choosing.
  const early = await attempt("sweepStaged()", () => adapter.sweepStaged(EARLIER()));
  if (early !== undefined && early !== 0) {
    say(`sweepStaged() dropped ${String(early)} files that were not old enough.`);
  }

  const kept = await attempt("commit()", () => adapter.commit(staged.key, "portraits"));
  if (kept !== undefined) {
    if (kept === "") say("commit() answered with an empty key.");
    const keptUrl = await attempt("url()", () => adapter.url(kept));
    if (keptUrl === "") say("url() of a committed file is empty.");

    // The staged one moved, so a sweep of everything has nothing to find. This
    // is the observable form of "a staged file is distinguishable from one that
    // belongs": an adapter that keeps them in one place answers 1 here, and a
    // reader's saved upload is what it just deleted.
    const after = await attempt("sweepStaged()", () => adapter.sweepStaged(LATER()));
    if (after !== undefined && after !== 0) {
      say(`sweepStaged() dropped ${String(after)} files after they were committed.`);
    }
  }

  // And a staged file that is never committed is exactly what the sweep is for.
  const abandoned = await attempt("stage()", () =>
    adapter.stage(file("never-saved.png")),
  );
  const dropped = await attempt("sweepStaged()", () => adapter.sweepStaged(LATER()));
  if (dropped !== undefined && dropped !== 1) {
    say(`sweepStaged() answered ${String(dropped)} for one abandoned file.`);
  }

  // Both the save's failure path and a deleted row can reach the same key, and
  // neither is in a position to find out first.
  const keys = [kept, abandoned?.key, "a-key-that-was-never-there"].filter(
    (key): key is string => key !== undefined,
  );
  await attempt("remove()", async () => {
    await adapter.remove(keys);
    await adapter.remove(keys);
  });

  return wrong;
}
