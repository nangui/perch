/**
 * Two outputs from one package — ADR 0009.
 *
 * The library entry keeps stable names and external React, because the exports
 * map names it and third-party plugins compile against it. The panel entry
 * inlines everything and carries a content hash, because it is served to a
 * browser that resolves no bare specifier and caches by filename.
 */
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsdown";

/** Same shape as rolldown's `[hash]`, so both entries read alike. */
function hash(path: string): string {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("base64url")
    .slice(0, 8);
}

/**
 * The shape `PanelModule` refuses to start on when it does not recognise it
 * (ADR 0007 §4). Bump it whenever an entry is renamed, removed, or when the
 * shell contract in `src/panel.tsx` changes.
 */
const MANIFEST_VERSION = 2;

export default defineConfig([
  {
    entry: ["src/index.ts", "src/styles.css"],
    format: ["esm"],
    dts: true,
    // Both configs run concurrently, so neither may empty `dist`: the winner
    // would delete the other's output. `build` clears it once, before tsdown.
    clean: false,
    tsconfig: "tsconfig.build.json",
    platform: "browser",
    // Pinned: see core/tsdown.config.ts.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    // Defaults to style.css; the exports map advertises styles.css.
    css: { fileName: "styles.css" },
  },
  {
    entry: { panel: "src/panel.tsx" },
    format: ["esm"],
    dts: false,
    clean: false,
    tsconfig: "tsconfig.build.json",
    platform: "browser",
    // Nothing external: a browser resolves no bare specifier, and PanelModule
    // may serve nothing but this package (ADR 0007 §5).
    noExternal: [/.*/],
    minify: true,
    /**
     * `hash: true` only names non-entry chunks, so the hashes the budget rests
     * on are spelled out here. Immutable caching is the whole point: the file
     * name changes when the bytes do, and never otherwise.
     */
    outputOptions: {
      entryFileNames: "panel-[hash].js",
      chunkFileNames: "panel-[hash].js",
      assetFileNames: "panel-[hash][extname]",
    },
    // `fileName` takes a fixed string with no hash placeholder, so the CSS is
    // hashed below instead. Nothing references it by name — it is extracted,
    // not imported — so renaming it after the fact is safe.
    css: { fileName: "panel.css" },
    hooks: {
      "build:done": (context) => {
        const { outDir } = context.options;
        const js = context.chunks.find((c) => /^panel-[^.]+\.js$/.test(c.fileName));
        const css = context.chunks.find((c) => c.fileName === "panel.css");
        // Failing here beats shipping a manifest that names a file nobody
        // wrote: the error lands at build time rather than as a 404 in a
        // browser.
        if (js === undefined || css === undefined) {
          throw new Error(
            `the panel build emitted ${context.chunks.map((c) => c.fileName).join(", ")}; ` +
              `the manifest would lie`,
          );
        }

        const hashed = `panel-${hash(join(outDir, css.fileName))}.css`;
        renameSync(join(outDir, css.fileName), join(outDir, hashed));

        writeFileSync(
          join(outDir, "manifest.json"),
          `${JSON.stringify(
            {
              manifestVersion: MANIFEST_VERSION,
              entries: { "panel.js": js.fileName, "panel.css": hashed },
            },
            null,
            2,
          )}\n`,
        );
      },
    },
  },
]);
