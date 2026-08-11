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
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Ir } from "@perchjs/core";
import type { Finding, Project } from "./doctor.js";
import type { SchemaReading } from "./schema-fingerprint.js";
import type { GeneratedFile, Source } from "./panel.js";
import { diagnose } from "./doctor.js";
import { readSchema } from "./schema-fingerprint.js";
import type { ResourceSource } from "./resource.js";
import { addToList } from "./module-edit.js";
import {
  adminModulePath,
  findClient,
  findHolder,
  generatePanel,
  register,
} from "./panel.js";
import { generateResource, resourceEntry } from "./resource.js";

export type { ResourceSource } from "./resource.js";
export type { Finding, Level, Project } from "./doctor.js";
export type { SchemaReading } from "./schema-fingerprint.js";
export type { ClientBinding, GeneratedFile, PanelOptions, Source } from "./panel.js";
export { readSchema } from "./schema-fingerprint.js";
export { diagnose, SUPPORTED_PRISMA_MAJOR } from "./doctor.js";
export {
  ADMIN_MODULE,
  findClient,
  findHolder,
  generatePanel,
  PANEL_DATA,
  register,
} from "./panel.js";
export { generateResource, resourceEntry, slugOf } from "./resource.js";
export type { Entry } from "./module-edit.js";
export { addToList, importFrom } from "./module-edit.js";

/** Where `@perchjs/prisma-generator` puts its output unless told otherwise. */
export const DEFAULT_IR = "./perch/ir.json";
export const DEFAULT_SCHEMA = "./prisma/schema.prisma";
export const DEFAULT_SRC = "./src";
export const DEFAULT_PANEL_PATH = "/admin";

const USAGE = `perch — code generation for a Perch panel

  perch panel              wire a panel into this application
  perch resource <Model>   write src/admin/resources/<model>.resource.ts
  perch doctor             check what this project is missing

Options
  --ir <path>       where the generated IR lives (default: ${DEFAULT_IR})
  --schema <path>   schema.prisma (default: ${DEFAULT_SCHEMA})
  --src <path>      the application's source root (default: ${DEFAULT_SRC})
  --path <url>      where the panel answers (default: ${DEFAULT_PANEL_PATH})
  --write           apply the changes; without it, perch panel only shows them
  --force           overwrite a file that is already there
`;

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      ir: { type: "string", default: DEFAULT_IR },
      schema: { type: "string", default: DEFAULT_SCHEMA },
      src: { type: "string", default: DEFAULT_SRC },
      path: { type: "string", default: DEFAULT_PANEL_PATH },
      write: { type: "boolean", default: false },
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
  if (command === "panel") {
    return await panel(values);
  }
  if (command !== "resource") {
    process.stderr.write(`perch: unknown command "${command}".\n\n${USAGE}`);
    return 1;
  }
  if (model === undefined) {
    process.stderr.write(`perch resource: name the model.\n\n${USAGE}`);
    return 1;
  }

  const src = sourceRoot(values.src);
  const ir = await readIr(values.ir);
  const generated = generateResource(ir, model, src);
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

  await putOnThePanel(generated, src);
  return 0;
}

/**
 * The resource added to the panel module, which is the last hand-edit on the
 * way to a working panel.
 *
 * Written without asking, unlike `perch panel`'s edit to the root module: that
 * one changes a file the developer wrote, this one changes a file Perch wrote
 * and whose `resources` list exists for exactly this. A file it cannot read
 * without guessing is left alone with the line to add printed.
 */
async function putOnThePanel(generated: ResourceSource, src: string): Promise<void> {
  const path = adminModulePath(src);
  const module = resolve(path);
  const entry = resourceEntry(generated, src);

  if (!existsSync(module)) {
    process.stdout.write(
      `perch: no ${path}, so nothing lists it yet. Run \`perch panel\`.\n`,
    );
    return;
  }

  const before = await readFile(module, "utf8");
  const after = addToList(before, entry);

  if (after === undefined) {
    process.stdout.write(
      `\nAdd it to ${path} yourself:\n\n` +
        `  import { ${entry.className} } from "${entry.from}";\n` +
        `  resources: [${entry.className}]\n\n`,
    );
    return;
  }
  if (after === before) {
    process.stdout.write(`perch: ${entry.className} is already on the panel\n`);
    return;
  }

  await writeFile(module, after, "utf8");
  process.stdout.write(`perch: added ${entry.className} to ${path}\n`);
}

/** `--src`, as a path relative to the project. */
function sourceRoot(src: string): string {
  return relative(resolve("."), resolve(src)).split(sep).join("/");
}

/**
 * `perch panel`. Shows what it would do; `--write` is what does it.
 *
 * That is the mitigation the design names for a command that edits code
 * somebody else wrote, and it costs one flag on the path to a first panel.
 */
async function panel(values: {
  ir: string;
  src: string;
  path: string;
  write: boolean;
  force: boolean;
}): Promise<number> {
  const root = resolve(values.src);
  const sources = await sourcesUnder(root);
  // Relative to the project, so what is generated lands under the root `--src`
  // named rather than under a hard-coded `src`.
  const src = sourceRoot(values.src);
  const client = findClient(sources, src);
  const holder = client === undefined ? findHolder(sources, src) : undefined;
  const files = generatePanel(
    { path: values.path, ir: relative(resolve("."), resolve(values.ir)), src },
    client,
  );

  const present = files.filter((file) => existsSync(resolve(file.path)));
  if (present.length > 0 && !values.force) {
    for (const file of present) {
      process.stderr.write(`perch: ${file.path} is already there.\n`);
    }
    process.stderr.write("Read them, then re-run with --force to replace them.\n");
    return 1;
  }

  const appModule = resolve(root, "app.module.ts");
  const before = existsSync(appModule) ? await readFile(appModule, "utf8") : undefined;
  const after = before === undefined ? undefined : register(before, src);
  // Three outcomes, and they are not two: the edit is needed, it is already
  // there, or the file is a shape this will not touch. Telling somebody to add
  // a line they added last week is its own kind of wrong.
  const registration: Registration =
    after === undefined ? "refused" : after === before ? "already" : "needed";

  if (!values.write) {
    return preview(files, client, holder, registration, values.path);
  }

  for (const file of files) {
    await mkdir(dirname(resolve(file.path)), { recursive: true });
    await writeFile(resolve(file.path), file.contents, "utf8");
    process.stdout.write(`perch: wrote ${file.path}\n`);
  }

  if (registration === "needed" && after !== undefined) {
    await writeFile(appModule, after, "utf8");
    process.stdout.write(
      `perch: registered AdminModule in ${values.src}/app.module.ts\n`,
    );
  } else if (registration === "already") {
    process.stdout.write("perch: AdminModule is already in your root module\n");
  } else {
    process.stdout.write(`\nAdd this to your root module yourself:\n\n${PASTE}\n`);
  }

  process.stdout.write(
    advice(client, holder) + `perch: your panel is at ${values.path}\n`,
  );
  return 0;
}

type Registration = "needed" | "already" | "refused";

const PASTE =
  `  import { AdminModule } from "./admin/admin.module.js";\n\n` +
  `  @Module({ imports: [AdminModule] })\n`;

/** What `--write` would do, and nothing else. */
function preview(
  files: readonly GeneratedFile[],
  client: ReturnType<typeof findClient>,
  holder: string | undefined,
  registration: Registration,
  path: string,
): number {
  process.stdout.write("perch panel would:\n\n");
  for (const file of files) process.stdout.write(`  create  ${file.path}\n`);
  process.stdout.write(
    {
      needed: "  edit    src/app.module.ts — add AdminModule to its imports\n",
      already: "  leave   src/app.module.ts alone; AdminModule is already there\n",
      refused: "  leave   your root module alone; it will print what to add\n",
    }[registration],
  );
  process.stdout.write(`\nYour panel would answer at ${path}.\n`);
  process.stdout.write(advice(client, holder));

  for (const file of files) {
    process.stdout.write(`\n--- ${file.path}\n${file.contents}`);
  }
  process.stdout.write("\nRe-run with --write to apply.\n");
  return 0;
}

function advice(client: ReturnType<typeof findClient>, holder?: string): string {
  if (client !== undefined) {
    return `\nPanelData injects ${client.className}, which is your Prisma client.\n\n`;
  }
  if (holder !== undefined) {
    // Saying "none was found" to somebody who has one is a lie, and the useful
    // half is which property to hand over.
    return (
      `\n${holder} holds a PrismaClient but is not one, and the adapter reads\n` +
      `its delegates directly. Provide that property as PANEL_PRISMA_CLIENT.\n\n`
    );
  }
  return (
    "\nNo Prisma client was found in your sources, so PanelData takes one\n" +
    "through PANEL_PRISMA_CLIENT. Provide it wherever you build your client —\n" +
    "Prisma 7 needs a driver adapter, so only you can.\n\n"
  );
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
    sources: (await sourcesUnder(resolve(srcPath))).map((source) => source.text),
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
async function sourcesUnder(root: string): Promise<readonly Source[]> {
  if (!existsSync(root)) return [];
  const out: Source[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !written(entry.name)) continue;
    if (entry.parentPath.split(sep).includes("node_modules")) continue;

    const file = resolve(entry.parentPath, entry.name);
    out.push({
      // Relative to the project, so a generated import can be built from it.
      path: relative(resolve("."), file).split(sep).join("/"),
      text: await readFile(file, "utf8"),
    });
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
