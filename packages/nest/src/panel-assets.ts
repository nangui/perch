/**
 * What `PanelModule` is allowed to serve, and nothing else.
 *
 * This package may resolve `@perchjs/ui` and read files from it, never import a
 * module of it. The manifest is named in the exports map rather than sitting
 * beside the entry, because resolving the package root throws under CommonJS
 * and this package publishes both formats.
 */
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const MANIFEST = "@perchjs/ui/manifest.json";

/** Bumped by `@perchjs/ui` whenever an entry is renamed or removed. */
export const SUPPORTED_MANIFEST_VERSION = 3;

/** The entries version 1 promises. Adding one here is a version bump. */
const REQUIRED_ENTRIES = ["panel.js", "panel.css"] as const;

export const PANEL_ASSETS = Symbol("PERCH_PANEL_ASSETS");

/** Addresses an application asked the panel to load beside its own bundle. */
export const PANEL_SCRIPTS = Symbol("PERCH_PANEL_SCRIPTS");
export const PANEL_STYLES = Symbol("PERCH_PANEL_STYLES");

export interface PanelAssets {
  readonly directory: string;
  /** Logical name → filename on disk, content-hashed. */
  readonly entries: Readonly<Record<string, string>>;
  /**
   * The rest of what the bundle is made of, named by filename alone.
   *
   * The entry imports some of these on sight and fetches others when a page
   * needs them — the editor's ProseMirror is a chunk nobody loads until a form
   * has a rich editor on it. Nothing here has a logical name because nothing
   * asks for one by name: the entry names them itself, in its own imports.
   */
  readonly chunks: readonly string[];
}

/**
 * Every package here moves in lockstep, so a version mismatch is a broken
 * install rather than a supported combination: the message says `pnpm install`.
 */
export function loadPanelAssets(manifestPath = resolveManifest()): PanelAssets {
  const directory = dirname(manifestPath);
  const manifest = parse(manifestPath);

  if (manifest.manifestVersion !== SUPPORTED_MANIFEST_VERSION) {
    throw new Error(
      `@perchjs/ui ships asset manifest version ${String(manifest.manifestVersion)}, ` +
        `and this @perchjs/nest understands ${String(SUPPORTED_MANIFEST_VERSION)}. ` +
        `The two packages are released together — reinstall so their versions match.`,
    );
  }

  // Without this an empty `entries` starts a panel that serves nothing.
  for (const required of REQUIRED_ENTRIES) {
    if (!(required in manifest.entries)) {
      throw new Error(
        `the asset manifest names no "${required}", which version ` +
          `${String(SUPPORTED_MANIFEST_VERSION)} requires. Rebuild @perchjs/ui.`,
      );
    }
  }

  for (const [name, file] of Object.entries(manifest.entries)) {
    // `isFile`, not `existsSync`: "." passes every check above and then exists.
    if (!isFile(join(directory, file))) {
      throw new Error(
        `the asset manifest names ${file} for "${name}", and that is not a file in ${directory}. ` +
          `Rebuild @perchjs/ui.`,
      );
    }
  }

  const chunks = chunksOf(manifest.chunks, manifestPath);
  for (const file of chunks) {
    if (!isFile(join(directory, file))) {
      throw new Error(
        `the asset manifest names the chunk ${file}, and that is not a file in ${directory}. ` +
          `Rebuild @perchjs/ui.`,
      );
    }
  }

  return { directory, entries: manifest.entries, chunks };
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveManifest(): string {
  try {
    return createRequire(import.meta.url).resolve(MANIFEST);
  } catch (cause) {
    throw new Error(
      `cannot resolve ${MANIFEST}. Either @perchjs/ui is not installed, or it is ` +
        `installed and never built — run the build before starting the panel.`,
      { cause },
    );
  }
}

interface Manifest {
  readonly manifestVersion: unknown;
  readonly entries: Readonly<Record<string, string>>;
  /** Read once the version is known to be one this package understands. */
  readonly chunks: unknown;
}

/** Shape-checked so a malformed manifest fails here, not as `undefined` in a URL. */
function parse(path: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`the asset manifest at ${path} is not valid JSON.`, { cause });
  }

  // `typeof [] === "object"`, so arrays are ruled out by name at both levels.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`the asset manifest at ${path} is not an object.`);
  }
  const { manifestVersion, entries, chunks } = value as Record<string, unknown>;

  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    throw new Error(`the asset manifest at ${path} has no entries.`);
  }
  for (const [name, file] of Object.entries(entries)) {
    if (typeof file !== "string" || file.length === 0) {
      throw new Error(
        `the asset manifest at ${path} maps "${name}" to something that is not a filename.`,
      );
    }
    // A separator or a climb is a path, and a path is what the static route
    // must never be handed.
    if (/[/\\]|\.\./.test(file)) {
      throw new Error(
        `the asset manifest at ${path} maps "${name}" to a path, not a filename: ${file}`,
      );
    }
  }

  return { manifestVersion, entries: entries as Record<string, string>, chunks };
}

/**
 * The chunk list, read after the version and not before it.
 *
 * A manifest from an older `@perchjs/ui` has no chunks in it, and what that
 * needs said is "reinstall" rather than a complaint about a field its version
 * never had.
 */
function chunksOf(chunks: unknown, path: string): readonly string[] {
  if (!Array.isArray(chunks)) {
    throw new Error(`the asset manifest at ${path} has no chunks.`);
  }
  for (const file of chunks) {
    if (typeof file !== "string" || file.length === 0 || /[/\\]|\.\./.test(file)) {
      throw new Error(
        `the asset manifest at ${path} lists a chunk that is not a filename: ${String(file)}`,
      );
    }
  }
  return chunks as readonly string[];
}
