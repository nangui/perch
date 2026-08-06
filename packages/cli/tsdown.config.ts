import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  // ESM only: this package is a binary, and nothing requires a binary.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
