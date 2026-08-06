import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/styles.css"],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  // Served to a browser by PanelModule, never required from Node.
  platform: "browser",
  // Pinned: see core/tsdown.config.ts.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  // Defaults to style.css; the exports map advertises styles.css.
  css: { fileName: "styles.css" },
});
