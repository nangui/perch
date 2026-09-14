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
 * happens once, in one process, before the first worker starts — and it is a
 * pair of `existsSync` calls when the tree is already built, which is nearly
 * always.
 *
 * It does not check whether the build is *current*, only that it is there.
 * Freshness is `pnpm verify`'s and CI's, both of which build before they test;
 * an earlier attempt to police it here by comparing timestamps was
 * intermittent, which is worse than the hazard it was aimed at.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** Everything the proofs reach for, named where it is read rather than guessed. */
function missing(): readonly string[] {
  const wanted: string[] = [];
  for (const name of readdirSync(join(ROOT, "packages"))) {
    // A package with no sources builds nothing and is not expected to.
    if (!existsSync(join(ROOT, "packages", name, "src"))) continue;
    wanted.push(join("packages", name, "dist", "index.d.ts"));
  }
  // The renderer's manifest: the asset controller resolves it by name, and the
  // bundle budget reads the byte counts out of it.
  wanted.push(join("packages", "ui", "dist", "manifest.json"));
  // The published CommonJS entry, which the asset proof imports both ways.
  wanted.push(join("packages", "nest", "dist", "index.cjs"));

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
