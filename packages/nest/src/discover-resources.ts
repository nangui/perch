/**
 * The resources in a folder, found rather than listed.
 *
 * The second of the two ways a panel learns what it has, and the one for a
 * codebase where adding a resource should not also mean editing a module.
 * Listing them stays the recommended way: an array says what is in the panel
 * where somebody reading the module can see it, and a bundler can drop what is
 * not named. This is for the other preference, and both may be used at once.
 *
 * Asynchronous, which the shape of the ecosystem decides rather than taste.
 * Finding the files is a synchronous question; loading a module is not one an
 * ESM runtime will answer synchronously, and this repository is ESM. So it is
 * awaited where the module is declared:
 *
 * ```ts
 * const resources = await discoverResources({ in: "dist/ ** / *.resource.js" });
 * ```
 *
 * It refuses rather than returning nothing. A scan that matches no files is a
 * panel with no resources, which is a panel whose every page answers 404 for a
 * reason no message anywhere would give.
 */
import { glob } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResourceClass } from "./resource-registry.js";
import { resourceMetadata } from "./resource.js";

export interface DiscoverOptions {
  /** A glob, matched against what is on disk at the time this runs. */
  readonly in: string;
  /** Where the glob starts. The process's working directory by default. */
  readonly from?: string;
}

/** The mistake the documented example invites, in either of its two endings. */
const NAMES_SOURCES =
  "That pattern names TypeScript sources. An application runs the JavaScript " +
  "built from them, and Node cannot load a `.ts` file, so point it at the " +
  "built files instead.";

function looksLikeSource(pattern: string): boolean {
  return /(^|[/\\])src([/\\]|$)/.test(pattern) || pattern.endsWith(".ts");
}

/**
 * The advice that comes with an empty result.
 *
 * Saying which mistake it probably is beats saying that no files matched.
 */
function nothingMatched(pattern: string, from: string): Error {
  return new Error(
    `discoverResources found no files for \`${pattern}\` under ${from}. ` +
      (looksLikeSource(pattern)
        ? NAMES_SOURCES
        : "Check the pattern against what is on disk where the panel starts."),
  );
}

/**
 * The advice that comes with a file that will not load.
 *
 * The same mistake with the ending nobody expects. Run from a project's root
 * and `src/**` matches, so the pattern is not empty and the failure arrives as
 * a syntax error out of the loader, pointing at a line of TypeScript. The
 * first version of this said nothing at all in the case that actually happens,
 * which is what testing it against an application rather than a fixture found.
 */
function willNotLoad(match: string, pattern: string, cause: unknown): Error {
  return new Error(
    `discoverResources could not load ${match}. ` +
      (looksLikeSource(pattern) || match.endsWith(".ts")
        ? NAMES_SOURCES
        : `It is matched by \`${pattern}\` and did not import: ${String(cause)}`),
    { cause },
  );
}

/**
 * Every class carrying `@PanelResource`, from the files a glob matches.
 *
 * In the order the paths sort, so two runs build the same navigation. A class
 * found twice is one resource: the two ways of naming resources may be used
 * together, and one named in both is not a conflict.
 */
export async function discoverResources(
  options: DiscoverOptions,
): Promise<readonly ResourceClass[]> {
  const from = options.from ?? process.cwd();
  const matches: string[] = [];
  for await (const match of glob(options.in, { cwd: from })) matches.push(match);
  if (matches.length === 0) throw nothingMatched(options.in, from);

  const found = new Map<ResourceClass, true>();
  for (const match of matches.sort()) {
    const path = isAbsolute(match) ? match : resolve(from, match);
    let loaded: Record<string, unknown>;
    try {
      loaded = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
    } catch (cause) {
      throw willNotLoad(match, options.in, cause);
    }

    const here = Object.values(loaded).filter(
      (exported): exported is ResourceClass => resourceMetadata(exported) !== undefined,
    );
    // A file the pattern claims is a resource and that holds none is a file
    // somebody expected in the panel. Quietly skipping it is how a resource
    // goes missing and the panel says nothing.
    if (here.length === 0) {
      throw new Error(
        `discoverResources matched ${match}, which exports no @PanelResource class. ` +
          "Either it is not a resource, or the pattern is wider than it meant to be.",
      );
    }
    for (const one of here) found.set(one, true);
  }

  return [...found.keys()];
}
