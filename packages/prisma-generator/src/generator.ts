#!/usr/bin/env node
/**
 * The `perch-prisma-generator` binary.
 *
 * Prisma spawns it during `prisma generate` and speaks JSON-RPC over stdio; the
 * shebang above is what makes that work, and `generatorHandler` is the other
 * side of that protocol. Everything decidable without the DMMF lives elsewhere,
 * so it can be tested without starting an RPC handler.
 */
import helper from "@prisma/generator-helper";
import type { GeneratorOptions } from "@prisma/generator-helper";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emitIr } from "./emit.js";
import { readDmmf } from "./dmmf-reader.js";
import { readOptionsOf } from "./options.js";
import { fingerprintOf } from "./schema-fingerprint.js";

const { generatorHandler } = helper;

generatorHandler({
  onManifest: () => ({
    prettyName: "Perch IR",
    defaultOutput: "./perch",
    version: "0.0.0",
  }),
  onGenerate: async (options: GeneratorOptions): Promise<void> => {
    const ir = readDmmf(options.dmmf, readOptionsOf(options.generator.config));
    const directory = outputOf(options);

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "ir.ts"), emitIr(ir), "utf8");
    // The same IR, for a reader that is not TypeScript. `@perchjs/cli` runs as
    // a plain Node binary and cannot import the module above; parsing it back
    // out of the source would be string surgery on a file we already have.
    await writeFile(
      join(directory, "ir.json"),
      `${JSON.stringify(ir, null, 2)}\n`,
      "utf8",
    );
    // What `perch doctor` compares against to notice a stale IR. The
    // fingerprint and nothing else: a path would differ between machines and a
    // timestamp would change the file on every run, both noise in a diff.
    await writeFile(
      join(directory, "perch.meta.json"),
      `${JSON.stringify({ schemaHash: await fingerprintOf(options.schemaPath) }, null, 2)}\n`,
      "utf8",
    );
  },
});

function outputOf(options: GeneratorOptions): string {
  const output = options.generator.output?.value;
  if (output === undefined || output === null || output === "") {
    // Prisma resolves `defaultOutput` against the schema, so an absent value
    // here means the contract changed rather than that the user left it out.
    throw new Error("Prisma gave the generator no output path.");
  }
  return output;
}
