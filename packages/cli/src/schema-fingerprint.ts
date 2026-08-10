/**
 * A fingerprint of the schema as it sits on disk, and the text that produced it.
 *
 * The rule has to match `@perchjs/prisma-generator`'s byte for byte — it writes
 * the fingerprint, this reads it — and the two are separate copies because this
 * package may only import core. `tooling/doctor-generator.test.ts` runs both
 * over one project and fails if they ever drift apart.
 *
 * What is being fingerprinted is the file, never Prisma's `datamodel`: Prisma
 * hands generators its own formatted rendering of the schema, so hashing that
 * against the file a user edits reports a stale IR on a project where nothing
 * is wrong.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface SchemaReading {
  /** Every schema file, concatenated. What the text checks read. */
  readonly text: string;
  readonly fingerprint: string;
}

export async function readSchema(schemaPath: string): Promise<SchemaReading> {
  const parts = await partsOf(schemaPath);
  const hash = createHash("sha256");
  for (const [name, text] of parts) {
    // Length-prefixed, so two schema files cannot fingerprint the same as
    // one whose contents happen to run together.
    hash.update(`${String(name.length)}:${name}${String(text.length)}:${text}`);
  }

  return {
    text: parts.map(([, text]) => text).join("\n"),
    fingerprint: `sha256:${hash.digest("hex")}`,
  };
}

/** Each schema file as `[path relative to the root, contents]`, sorted. */
async function partsOf(
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
