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
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Ir } from "@perchjs/core";
import type { Finding, Project } from "./doctor.js";
import type { SchemaReading } from "./schema-fingerprint.js";
import { diagnose } from "./doctor.js";
import { readSchema } from "./schema-fingerprint.js";
import { generateResource } from "./resource.js";

export type { ResourceSource } from "./resource.js";
export type { Finding, Level, Project } from "./doctor.js";
export type { SchemaReading } from "./schema-fingerprint.js";
export { readSchema } from "./schema-fingerprint.js";
export { diagnose, SUPPORTED_PRISMA_MAJOR } from "./doctor.js";
export { generateResource, slugOf } from "./resource.js";

/** Where `@perchjs/prisma-generator` puts its output unless told otherwise. */
export const DEFAULT_IR = "./perch/ir.json";
export const DEFAULT_SCHEMA = "./prisma/schema.prisma";
export const DEFAULT_SRC = "./src";

const USAGE = `perch — code generation for a Perch panel

  perch resource <Model>   write src/admin/resources/<model>.resource.ts
  perch doctor             check what this project is missing

Options
  --ir <path>       where the generated IR lives (default: ${DEFAULT_IR})
  --schema <path>   schema.prisma (default: ${DEFAULT_SCHEMA})
  --src <path>      the application's source root (default: ${DEFAULT_SRC})
  --force           overwrite a file that is already there
`;

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      ir: { type: "string", default: DEFAULT_IR },
      schema: { type: "string", default: DEFAULT_SCHEMA },
      src: { type: "string", default: DEFAULT_SRC },
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
  if (command === "doctor") {
    return report(diagnose(await inspect(values.ir, values.schema, values.src)));
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

  // Regenerating destroys nothing without explicit confirmation. No three-way
  // merge and no markers — a merge that is quietly wrong inside an
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

/** Every finding, worst first, and an exit code a script can read. */
function report(findings: readonly Finding[]): number {
  if (findings.length === 0) {
    process.stdout.write("perch: nothing to report.\n");
    return 0;
  }

  const ordered = [...findings].sort((a, b) =>
    a.level === b.level ? 0 : a.level === "error" ? -1 : 1,
  );
  for (const finding of ordered) {
    process.stdout.write(
      `\n${finding.level === "error" ? "✗" : "!"} ${finding.title}\n  ${finding.fix}\n`,
    );
  }
  process.stdout.write("\n");
  return ordered.some((finding) => finding.level === "error") ? 1 : 0;
}

/**
 * Reads the project. Everything that can be absent is, rather than throwing:
 * a doctor that stops at the first missing file reports one problem per run.
 */
async function inspect(
  irPath: string,
  schemaPath: string,
  srcPath: string,
): Promise<Project> {
  const manifest = await maybeJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>("./package.json");
  const meta = await maybeJson<{ schemaHash?: string }>(
    resolve(dirname(resolve(irPath)), "perch.meta.json"),
  );
  const schema = await maybeSchema(schemaPath);
  const prismaVersion = (
    await maybeJson<{ version?: string }>("./node_modules/prisma/package.json")
  )?.version;

  return {
    inProject: manifest !== undefined,
    dependencies: { ...manifest?.dependencies, ...manifest?.devDependencies },
    ...(prismaVersion === undefined ? {} : { prismaVersion }),
    ...(schema === undefined
      ? {}
      : { schema: schema.text, schemaFingerprint: schema.fingerprint }),
    irPresent: existsSync(resolve(irPath)),
    ...(meta?.schemaHash === undefined ? {} : { irSchemaHash: meta.schemaHash }),
    sources: await sourcesUnder(resolve(srcPath)),
  };
}

/**
 * The schema, wherever Prisma 7 allows it to be: one file, or a directory of
 * them. A project using the directory form has no `prisma/schema.prisma`, and
 * reporting it missing would be a doctor that only knows one kind of project.
 */
async function maybeSchema(path: string): Promise<SchemaReading | undefined> {
  const file = resolve(path);
  if (existsSync(file)) return await readSchema(file);

  const folder = file.replace(/\.prisma$/, "");
  return existsSync(folder) ? await readSchema(folder) : undefined;
}

async function maybeText(path: string): Promise<string | undefined> {
  const where = resolve(path);
  return existsSync(where) ? await readFile(where, "utf8") : undefined;
}

async function maybeJson<T>(path: string): Promise<T | undefined> {
  const text = await maybeText(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A malformed file is one this reading cannot use; the check that wanted it
    // reports its own absence, which is a better message than a parse error.
    return undefined;
  }
}

/**
 * Every `.ts` the application itself is written in. Text is all these checks
 * need.
 *
 * Tests and declarations are left out, and so is anything under a
 * `node_modules`. A test naming two resources is a test, not two resources
 * fighting over one URL, and doctor reporting that would fail a build over
 * nothing.
 */
async function sourcesUnder(root: string): Promise<readonly string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !written(entry.name)) continue;
    if (entry.parentPath.split(sep).includes("node_modules")) continue;
    out.push(await readFile(resolve(entry.parentPath, entry.name), "utf8"));
  }
  return out;
}

function written(name: string): boolean {
  return (
    name.endsWith(".ts") &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".spec.ts")
  );
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
