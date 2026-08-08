/**
 * What `PanelModule` is allowed to serve, and nothing else.
 *
 * ADR 0007 §3 lets `@perchjs/nest` resolve `@perchjs/ui` and read files from it,
 * while forbidding it to import a single module. ADR 0009 §3 adds the one
 * specifier this file uses: the manifest is named by the exports map rather than
 * found beside the entry, because resolving the package root works under ESM and
 * throws under CommonJS — and this package publishes both.
 *
 * The manifest is a versioned contract (ADR 0007 §4). A version this build does
 * not know means the renderer and the adapter disagree about what `dist` holds,
 * and serving files on that basis is how a panel ends up half broken in a
 * browser with nothing in the logs. So it throws, at startup, saying which
 * versions are involved.
 */
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** The specifier ADR 0009 §3 adds to the permitted set. */
const MANIFEST = "@perchjs/ui/manifest.json";

/** Bumped by `@perchjs/ui` whenever an entry is renamed or removed. */
export const SUPPORTED_MANIFEST_VERSION = 1;

/** The entries version 1 promises. Adding one here is a version bump. */
const REQUIRED_ENTRIES = ["panel.js", "panel.css"] as const;

export interface PanelAssets {
  /** Absolute path of the directory holding the files below. */
  readonly directory: string;
  /** Logical name → filename on disk, content-hashed. */
  readonly entries: Readonly<Record<string, string>>;
}

/**
 * Under lockstep versioning (ADR 0008) the two packages are installed together,
 * so a mismatch here is a broken installation rather than a supported
 * combination. The message says so, because the fix is `pnpm install`, not code.
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

  // What version 1 means. Without this an empty `entries` starts a panel that
  // serves nothing, which is the "at random" ADR 0007 §4 refuses.
  for (const required of REQUIRED_ENTRIES) {
    if (!(required in manifest.entries)) {
      throw new Error(
        `the asset manifest names no "${required}", which version ` +
          `${String(SUPPORTED_MANIFEST_VERSION)} requires. Rebuild @perchjs/ui.`,
      );
    }
  }

  for (const [name, file] of Object.entries(manifest.entries)) {
    // `isFile`, not `existsSync`: an entry of "." passes every shape check above
    // and then exists, because it is the directory.
    if (!isFile(join(directory, file))) {
      throw new Error(
        `the asset manifest names ${file} for "${name}", and that is not a file in ${directory}. ` +
          `Rebuild @perchjs/ui.`,
      );
    }
  }

  return { directory, entries: manifest.entries };
}

/** A name that is not a regular file — a directory, a socket, or absent. */
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

/**
 * Shape-checked rather than trusted. Not because the file is hostile — it comes
 * from `node_modules` — but because a malformed one otherwise surfaces as
 * `undefined` in a URL, several layers away from the cause.
 */
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
    // A manifest is a name-to-name map. A separator or a climb means somebody is
    // describing a path, and a path is how the static route starts serving what
    // it should not.
    if (/[/\\]|\.\./.test(file)) {
      throw new Error(
        `the asset manifest at ${path} maps "${name}" to a path, not a filename: ${file}`,
      );
    }
  }

  return { manifestVersion, entries: entries as Record<string, string> };
}
