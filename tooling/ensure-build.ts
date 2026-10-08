/**
 * One build for the whole run, before any of it starts.
 *
 * Four proofs here read what the packages publish — the boundary cruise, the
 * asset manifest, the bundle budget and the documented examples — and every one
 * of them needs `dist` to exist. Each used to check for itself and build if it
 * was missing, which reads as careful and is a race: vitest runs files in
 * parallel, so on a cold tree three of them start `pnpm run build` at the same
 * moment, write the same directories, and read each other's half-written
 * output. The boundary cruise then reports sixteen violations, all of them
 * about imports that resolve perfectly well.
 *
 * A precondition of the run belongs to the run. This is `globalSetup`, so it
 * happens once, in one process, before the first worker starts — and when the
 * tree is already built, which is nearly always, it is two dozen `existsSync`
 * calls over what the manifests publish.
 *
 * It does not check whether the build is *current*, only that it is there.
 * Freshness is `pnpm verify`'s and CI's, both of which build before they test;
 * an earlier attempt to police it here by comparing timestamps was
 * intermittent, which is worse than the hazard it was aimed at.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** Every path a manifest points into `dist`, however deeply it is nested. */
function published(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    if (value.startsWith("./dist/")) into.push(value.slice(2));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const one of Object.values(value as Record<string, unknown>))
    published(one, into);
}

/**
 * Everything the proofs reach for, read from what each package publishes.
 *
 * It named one file per package — `dist/index.d.ts` — plus two by hand, and a
 * `dist` holding its types and not its JavaScript therefore passed. An
 * interrupted build leaves exactly that shape, and what followed was nine
 * suites failing at once: the boundary cruise reporting a violation about an
 * import that resolves, and five packages reported unimportable. Reproduced by
 * deleting `packages/core/dist/index.js` and leaving the types beside it.
 *
 * So the entries are read from the manifests rather than guessed. A package
 * that publishes a CommonJS half, a stylesheet or an asset manifest says so
 * there, and this follows it.
 */
function missing(): readonly string[] {
  const wanted: string[] = [];
  for (const name of readdirSync(join(ROOT, "packages"))) {
    // A package with no sources builds nothing and is not expected to.
    if (!existsSync(join(ROOT, "packages", name, "src"))) continue;
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "packages", name, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    const paths: string[] = [];
    for (const field of ["main", "module", "types", "exports"]) {
      published(manifest[field], paths);
    }
    for (const one of new Set(paths)) wanted.push(join("packages", name, one));
  }

  return wanted.filter((one) => !existsSync(join(ROOT, one)));
}

export function setup(): void {
  const absent = missing();
  if (absent.length === 0) return;

  const build = spawnSync("pnpm", ["run", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (build.status !== 0) {
    throw new Error(
      `pnpm run build failed, so the proofs that read what the packages publish ` +
        `cannot run:\n${build.stderr}`,
    );
  }

  const still = missing();
  if (still.length > 0) {
    // Built, and the files are still not there. Said plainly rather than left
    // to surface as a hundred unresolvable imports three suites later.
    throw new Error(
      `pnpm run build succeeded and these are still missing:\n  ${still.join("\n  ")}`,
    );
  }
}
