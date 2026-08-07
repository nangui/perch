/**
 * ARCH 13 §8: "Budget: main bundle < 250 KB gzip. Measured in CI, blocking."
 *
 * The panel bundle carries React, ReactDOM, Radix and the renderer, because
 * ADR 0009 puts them there rather than asking a browser to resolve bare
 * specifiers. That decision is only affordable while this number holds — and
 * the first reopening rule of ADR 0009 is this test failing with no split left
 * to make.
 *
 * The manifest is checked alongside, because a budget met by a file nobody
 * serves proves nothing.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "packages", "ui", "dist");
const MANIFEST = join(DIST, "manifest.json");

/** ARCH 13 §8. Gzip, since that is what crosses the wire. */
const BUDGET_BYTES = 250 * 1024;

interface Manifest {
  readonly manifestVersion: number;
  readonly entries: Record<string, string>;
}

let manifest: Manifest;

beforeAll(() => {
  // Same reason as the boundary suite: on a fresh clone `dist` does not exist,
  // and a test that fails for an environmental reason gets ignored.
  if (!existsSync(MANIFEST)) {
    const build = spawnSync("pnpm", ["--filter", "@perchjs/ui", "run", "build"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (build.status !== 0) {
      throw new Error(`building @perchjs/ui failed:\n${build.stderr}`);
    }
  }
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
});

const gzipped = (file: string): number =>
  gzipSync(readFileSync(join(DIST, file))).length;

describe("the panel bundle — ARCH 13 §8", () => {
  it("names files that exist", () => {
    for (const [logical, file] of Object.entries(manifest.entries)) {
      expect(
        existsSync(join(DIST, file)),
        `${logical} names ${file}, which is absent`,
      ).toBe(true);
    }
  });

  it("leaves no panel file the manifest does not name", () => {
    // Hashed names accumulate: every build writes a new one and nothing removes
    // the last. `files: ["dist"]` would publish the lot. The package's `build`
    // script clears dist first, and this is what says so if it ever stops.
    const named = new Set(Object.values(manifest.entries));
    const stale = readdirSync(DIST).filter(
      (f) => f.startsWith("panel-") && !named.has(f),
    );
    expect(stale, `${stale.join(", ")} would ship as dead weight`).toEqual([]);
  });

  it("names hashed files, so the cache can be immutable", () => {
    // An unhashed name served with a long max-age is a stale panel nobody can
    // flush. The hash is what makes the header safe.
    for (const file of Object.values(manifest.entries)) {
      expect(file, `${file} carries no content hash`).toMatch(
        /^panel-[\w-]{8}\.(js|css)$/,
      );
    }
  });

  it(`keeps the main bundle under ${String(BUDGET_BYTES / 1024)} KB gzip`, () => {
    const js = manifest.entries["panel.js"];
    expect(js, "the manifest names no panel.js").toBeDefined();
    const size = gzipped(js!);

    expect(
      size,
      `panel.js is ${(size / 1024).toFixed(1)} KB gzip (${String(statSync(join(DIST, js!)).size)} B raw), ` +
        `against a ${String(BUDGET_BYTES / 1024)} KB budget. ADR 0009 reopens if no split brings it back.`,
    ).toBeLessThan(BUDGET_BYTES);
  });

  it("keeps the library entry free of the panel's weight", () => {
    // The two outputs exist so that neither pays for the other. If React ever
    // leaks into the library build, this is what says so.
    const library = readFileSync(join(DIST, "index.js"), "utf8");
    expect(library, "the library entry must keep React external").toMatch(
      /from\s*"react"/,
    );
  });
});
