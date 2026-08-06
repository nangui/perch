import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/styles.css"],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  // The renderer is served to a browser by PanelModule, never required from a
  // Node process, so it is ESM only and built for the browser.
  platform: "browser",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  // The CSS chunk is named `style.css` by default. The package advertises
  // `@perchjs/ui/styles.css` and the exports map has to point at a real file, so
  // the name is pinned rather than the published contract bent to fit a default.
  css: { fileName: "styles.css" },
});
