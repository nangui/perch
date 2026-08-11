/**
 * `perch panel` — the module that wires a panel, and the adapter behind it.
 *
 * Everything here is a function of the sources it was handed, so the decisions
 * can be read without a temp directory. Writing them out is `index.ts`, and it
 * writes nothing until told to: the design names a dry run with the diff shown
 * as the mitigation for a command that edits code somebody else wrote.
 *
 * The one thing this cannot do is build the Prisma client. Prisma 7 takes its
 * connection through a driver adapter and its URL out of the schema entirely,
 * so the client is the application's to construct — this finds the provider
 * that already holds one, and says so when there is none.
 */
import { addToList, importFrom, normaliseRoot } from "./module-edit.js";

export interface Source {
  /** Relative to the source root, with `/` separators. */
  readonly path: string;
  readonly text: string;
}

/** The provider that already holds a Prisma client, if the app has one. */
export interface ClientBinding {
  readonly className: string;
  /** What `src/admin/panel-data.ts` imports it from. */
  readonly importPath: string;
  /** The module exporting it, which the panel has to import to inject it. */
  readonly module?: { readonly className: string; readonly importPath: string };
}

export interface PanelOptions {
  /** Where the panel answers, e.g. `/admin`. */
  readonly path: string;
  /** The generated IR module, relative to the project root. */
  readonly ir: string;
  /** The application's source root. `--src` is honoured, not ignored. */
  readonly src?: string;
}

export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

/** Where they land under the default source root, and what tests name. */
export const ADMIN_MODULE = "src/admin/admin.module.ts";
export const PANEL_DATA = "src/admin/panel-data.ts";

/** The same two under whichever source root `--src` named. */
export function adminModulePath(src = "src"): string {
  return `${normaliseRoot(src)}/admin/admin.module.ts`;
}

export function panelDataPath(src = "src"): string {
  return `${normaliseRoot(src)}/admin/panel-data.ts`;
}

/**
 * A class that **is** a Prisma client, found in the application's own sources.
 *
 * `extends PrismaClient` and nothing else. The adapter reads `client[model]`
 * and `client.$transaction` off whatever it is given, so a class that merely
 * *holds* a client in a property has neither, and injecting it fails at the
 * first query — while `as never` keeps the compiler quiet about it. A guess
 * that compiles and then breaks is worse than no guess: see `findHolder`, which
 * is what turns that case into a sentence rather than a bug.
 *
 * Which one, when a project has two, is decided here rather than by the caller:
 * the directory walk has no order of its own, so the same project would
 * otherwise generate two different files on two runs. By path, and what a
 * previous run wrote is not a candidate.
 */
export function findClient(
  sources: readonly Source[],
  src?: string,
): ClientBinding | undefined {
  for (const source of candidatesIn(sources, src)) {
    const className = /export\s+class\s+(\w+)\s+extends\s+PrismaClient\b/.exec(
      source.text,
    )?.[1];
    if (className === undefined) continue;

    const module = moduleExporting(className, candidatesIn(sources, src), src);
    return {
      className,
      importPath: importFrom(panelDataPath(src), source.path),
      ...(module === undefined ? {} : { module }),
    };
  }
  return undefined;
}

/**
 * A class that holds a client without being one. Not injectable, but knowing it
 * is there is the difference between "no client was found" — which would be a
 * lie to somebody who has one — and telling them which property to hand over.
 */
export function findHolder(
  sources: readonly Source[],
  src?: string,
): string | undefined {
  for (const source of candidatesIn(sources, src)) {
    if (/export\s+class\s+\w+\s+extends\s+PrismaClient\b/.test(source.text)) continue;
    const holder = /export\s+class\s+(\w+)[^{]*\{[^}]*?:\s*PrismaClient\b/s.exec(
      source.text,
    )?.[1];
    if (holder !== undefined) return holder;
  }
  return undefined;
}

function candidatesIn(sources: readonly Source[], src?: string): readonly Source[] {
  const ours = new Set([adminModulePath(src), panelDataPath(src)]);
  return sources
    .filter((source) => !ours.has(source.path))
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

/** The module whose `exports` names that class — what makes it injectable here. */
function moduleExporting(
  className: string,
  sources: readonly Source[],
  src?: string,
): NonNullable<ClientBinding["module"]> | undefined {
  for (const source of sources) {
    const exported = new RegExp(`exports\\s*:\\s*\\[[^\\]]*\\b${className}\\b`, "s");
    if (!exported.test(source.text)) continue;

    const module = /export\s+class\s+(\w+)/.exec(source.text)?.[1];
    if (module === undefined) continue;
    return {
      className: module,
      importPath: importFrom(adminModulePath(src), source.path),
    };
  }
  return undefined;
}

export function generatePanel(
  options: PanelOptions,
  client: ClientBinding | undefined,
): readonly GeneratedFile[] {
  return [
    { path: adminModulePath(options.src), contents: adminModule(options, client) },
    { path: panelDataPath(options.src), contents: panelData(options, client) },
  ];
}

function adminModule(options: PanelOptions, client: ClientBinding | undefined): string {
  const module = client?.module;

  return `import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
${module === undefined ? "" : `import { ${module.className} } from "${module.importPath}";\n`}import { PanelData } from "./panel-data.js";

@Module({
  imports: [
    PanelModule.forRoot({
      // Quoted by the serialiser, not by hand: a path holding a quote would
      // otherwise write a file that does not parse.
      path: ${JSON.stringify(options.path)},
      // Add each resource here as you generate it: \`perch resource User\`
      // writes the class, and this is what puts it on the panel.
      resources: [],
      dataAdapter: PanelData,${
        module === undefined
          ? ""
          : `
      // PanelData is built here, so what it injects has to be visible here.
      imports: [${module.className}],`
      }
    }),
  ],
})
export class AdminModule {}
`;
}

/**
 * The adapter, as a class the container can build. `PrismaDataAdapter` takes an
 * options object, so it cannot be handed to `dataAdapter` directly; this is the
 * subclass that turns an injected client into that call.
 */
function panelData(options: PanelOptions, client: ClientBinding | undefined): string {
  const ir = importFrom(panelDataPath(options.src), options.ir);

  if (client === undefined) {
    // Nothing in the sources holds a client. A token is the honest shape: the
    // one line to write is visible, rather than a guess that fails at the first
    // query. `PrismaClientLike` is what the adapter actually calls.
    return `import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClientLike } from "@perchjs/prisma";
import { PrismaDataAdapter } from "@perchjs/prisma";
import { IR } from "${ir}";

/** Provide this with your PrismaClient, wherever you construct it. */
export const PANEL_PRISMA_CLIENT = Symbol("PANEL_PRISMA_CLIENT");

@Injectable()
export class PanelData extends PrismaDataAdapter {
  constructor(@Inject(PANEL_PRISMA_CLIENT) client: PrismaClientLike) {
    super({ client, ir: IR });
  }
}
`;
  }

  return `import { Injectable } from "@nestjs/common";
import { PrismaDataAdapter } from "@perchjs/prisma";
import { IR } from "${ir}";
import { ${client.className} } from "${client.importPath}";

@Injectable()
export class PanelData extends PrismaDataAdapter {
  constructor(client: ${client.className}) {
    // The adapter names the six delegate methods it calls rather than importing
    // Prisma's types, which only exist once the client has been generated.
    super({ client: client as never, ir: IR });
  }
}
`;
}

/**
 * `AdminModule` added to an existing `app.module.ts`.
 *
 * Refused, rather than attempted, on a file this cannot read without guessing:
 * more than one `imports`, or one that is not a plain array literal. The
 * caller prints the two lines to add instead.
 */
export function register(text: string, src = "src"): string | undefined {
  return addToList(text, {
    className: "AdminModule",
    from: importFrom(`${normaliseRoot(src)}/app.module.ts`, adminModulePath(src)),
    key: "imports",
    create: true,
  });
}
