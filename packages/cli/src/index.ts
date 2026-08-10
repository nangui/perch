#!/usr/bin/env node
/**
 * `@perchjs/cli` — the `perch` binary.
 *
 * Standalone rather than a Nest schematic, and reading the IR rather than the
 * DMMF. That second choice is the one that matters: `@perchjs/prisma-generator`
 * already turned the schema into an intermediate representation at
 * `prisma generate` (ADR 0012), and reading it again here would be a second
 * reading that can disagree with the panel's.
 */
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Ir } from "@perchjs/core";
import { generateResource } from "./resource.js";

export type { ResourceSource } from "./resource.js";
export { generateResource, slugOf } from "./resource.js";

/** Where `@perchjs/prisma-generator` puts its output unless told otherwise. */
export const DEFAULT_IR = "./perch/ir.json";

const USAGE = `perch — code generation for a Perch panel

  perch resource <Model>   write src/admin/resources/<model>.resource.ts

Options
  --ir <path>   where the generated IR lives (default: ${DEFAULT_IR})
  --force       overwrite a file that is already there
`;

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      ir: { type: "string", default: DEFAULT_IR },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const [command, model] = positionals;
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined && !values.help ? 1 : 0;
  }
  if (command !== "resource") {
    process.stderr.write(`perch: unknown command "${command}".\n\n${USAGE}`);
    return 1;
  }
  if (model === undefined) {
    process.stderr.write(`perch resource: name the model.\n\n${USAGE}`);
    return 1;
  }

  const ir = await readIr(values.ir);
  const generated = generateResource(ir, model);
  const target = resolve(generated.path);

  // PRD 10 §5.3: regenerating destroys nothing without explicit confirmation.
  // No three-way merge and no markers — a merge that is quietly wrong inside an
  // authorization rule is worse than ten seconds of reading a diff.
  if (existsSync(target) && !values.force) {
    process.stderr.write(
      `perch: ${generated.path} is already there.\n` +
        `Read it, then re-run with --force to replace it.\n`,
    );
    return 1;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, generated.contents, "utf8");
  process.stdout.write(`perch: wrote ${generated.path}\n`);
  return 0;
}

/**
 * The IR as JSON, which the generator writes beside the module it emits. The
 * module is TypeScript and this is a Node binary; parsing the literal back out
 * of it would be string surgery on a file we already have.
 */
async function readIr(path: string): Promise<Ir> {
  const where = resolve(path);
  if (!existsSync(where)) {
    throw new Error(
      `no IR at ${path}. Add the perch generator to schema.prisma and run ` +
        `\`prisma generate\`, or point --ir at where it writes.`,
    );
  }
  return JSON.parse(await readFile(where, "utf8")) as Ir;
}

// Only when this file is the program, so importing it runs nothing. Compared as
// URLs rather than by matching the tail of a path, which is the same check made
// less carefully and wrong for a relative argv.
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `perch: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
