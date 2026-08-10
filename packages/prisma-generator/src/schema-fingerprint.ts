/**
 * A fingerprint of the schema as it sits on disk.
 *
 * Deliberately not `options.datamodel`. Prisma hands a generator its own
 * formatted rendering of the schema — `id Int` arrives as `id    Int` — so
 * hashing that and comparing it to the file a user actually edits reports a
 * stale IR forever, on a project where nothing is wrong. Measured, not assumed.
 *
 * `@perchjs/cli` carries the same rule, because a CLI that may only import core
 * cannot import this. `tooling/doctor-generator.test.ts` runs both over one
 * project and fails if they ever disagree.
 *
 * Prisma 7 takes either one file or a directory of them, so a directory is
 * every `.prisma` under it keyed by its path: renaming a file changes the
 * fingerprint, and the order two files are read in cannot.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export async function fingerprintOf(schemaPath: string): Promise<string> {
  const hash = createHash("sha256");
  for (const [name, text] of await partsOf(schemaPath)) {
    // Length-prefixed, so two schema files cannot fingerprint the same as
    // one whose contents happen to run together.
    hash.update(`${String(name.length)}:${name}${String(text.length)}:${text}`);
  }
  return `sha256:${hash.digest("hex")}`;
}

/** Each schema file as `[path relative to the root, contents]`, sorted. */
export async function partsOf(
  schemaPath: string,
): Promise<readonly (readonly [string, string])[]> {
  if (!(await stat(schemaPath)).isDirectory()) {
    return [["", await readFile(schemaPath, "utf8")]];
  }

  const entries = await readdir(schemaPath, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".prisma"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();

  return Promise.all(
    files.map(
      async (file) =>
        [
          // Separator-independent, so the same checkout on two platforms agrees.
          relative(schemaPath, file).split(sep).join("/"),
          await readFile(file, "utf8"),
        ] as const,
    ),
  );
}
