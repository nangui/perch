import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  // Pinned: see core/tsdown.config.ts.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
