/**
 * What `PanelModule` is allowed to serve, and nothing else.
 *
 * ADR 0007 §3 lets this package resolve `@perchjs/ui` and read files from it,
 * never import a module of it. ADR 0009 §3 names the manifest in the exports map
 * rather than beside the entry, because resolving the package root throws under
 * CommonJS and this package publishes both formats.
 */
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const MANIFEST = "@perchjs/ui/manifest.json";

/** Bumped by `@perchjs/ui` whenever an entry is renamed or removed. */
export const SUPPORTED_MANIFEST_VERSION = 1;

/** The entries version 1 promises. Adding one here is a version bump. */
const REQUIRED_ENTRIES = ["panel.js", "panel.css"] as const;

export const PANEL_ASSETS = Symbol("PERCH_PANEL_ASSETS");

export interface PanelAssets {
  readonly directory: string;
  /** Logical name → filename on disk, content-hashed. */
  readonly entries: Readonly<Record<string, string>>;
}

/**
 * Under lockstep versioning (ADR 0008) a version mismatch is a broken install
 * rather than a supported combination, so the message says `pnpm install`.
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

  return { directory, entries: manifest.entries };
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
      `cannot resolve ${MANIFEST}. @perchjs/nest depends on @perchjs/ui to serve the ` +
        `panel (ADR 0007) — reinstall dependencies.`,
      { cause },
    );
  }
}

interface Manifest {
  readonly manifestVersion: unknown;
  readonly entries: Readonly<Record<string, string>>;
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
  const { manifestVersion, entries } = value as Record<string, unknown>;

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

  return { manifestVersion, entries: entries as Record<string, string> };
}
