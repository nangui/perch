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
import { dirname, join } from "node:path";
import { emitIr } from "./emit.js";
import { readDmmf } from "./dmmf-reader.js";
import { readOptionsOf } from "./options.js";

const { generatorHandler } = helper;

generatorHandler({
  onManifest: () => ({
    prettyName: "Perch IR",
    defaultOutput: "./perch",
    version: "0.0.0",
  }),
  onGenerate: async (options: GeneratorOptions): Promise<void> => {
    const ir = readDmmf(options.dmmf, readOptionsOf(options.generator.config));
    const target = join(outputOf(options), "ir.ts");

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, emitIr(ir), "utf8");
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
