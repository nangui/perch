/**
 * That `@perchjs/nest` can actually reach the manifest — ADR 0009 §3.
 *
 * The whole reason the manifest is named by the exports map rather than found
 * beside the entry is that resolving the package root throws under CommonJS,
 * and this package publishes both formats. That argument is only worth what the
 * artefacts do, so both are loaded here and asked for the real file.
 *
 * `tooling/resolution.test.ts` reads the source and says what nest is *allowed*
 * to resolve. This runs the build and says it *works*. Neither implies the
 * other: the guard passes happily on a specifier that resolves nowhere.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NEST_DIST = join(ROOT, "packages", "nest", "dist");

interface PanelAssets {
  readonly directory: string;
  readonly entries: Record<string, string>;
}
type Loader = () => PanelAssets;

beforeAll(() => {
  // Same reason as the boundary suite: on a fresh clone `dist` does not exist,
  // and a test that fails for an environmental reason gets ignored.
  const built =
    existsSync(join(NEST_DIST, "index.cjs")) &&
    existsSync(join(ROOT, "packages", "ui", "dist", "manifest.json"));
  if (built) return;
  const build = spawnSync("pnpm", ["run", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (build.status !== 0) throw new Error(`pnpm run build failed:\n${build.stderr}`);
}, 180_000);

describe("the published @perchjs/nest resolves the manifest", () => {
  it("from the ESM build", async () => {
    const module = (await import(pathToFileURL(join(NEST_DIST, "index.js")).href)) as {
      loadPanelAssets: Loader;
    };
    const assets = module.loadPanelAssets();

    expect(assets.entries["panel.js"]).toMatch(/^panel-[\w-]+\.js$/);
    expect(assets.entries["panel.css"]).toMatch(/^panel-[\w-]+\.css$/);
  });

  it("from the CommonJS build, where import.meta.url does not exist", async () => {
    // tsdown rewrites it to __filename. Asserted rather than assumed, because
    // the decision in ADR 0009 §3 rests entirely on this working.
    const { createRequire } = await import("node:module");
    const module = createRequire(import.meta.url)(join(NEST_DIST, "index.cjs")) as {
      loadPanelAssets: Loader;
    };
    const assets = module.loadPanelAssets();

    expect(assets.entries["panel.js"]).toMatch(/^panel-[\w-]+\.js$/);
  });

  it("agrees with the version @perchjs/ui ships", async () => {
    // Two constants that must move together — one in ui's tsdown config, one in
    // nest's reader — with nothing else linking them. A bump on one side alone
    // makes `loadPanelAssets` throw, which is what this notices.
    const module = (await import(pathToFileURL(join(NEST_DIST, "index.js")).href)) as {
      loadPanelAssets: Loader;
    };

    expect(() => module.loadPanelAssets()).not.toThrow();
  });
});
