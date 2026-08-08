import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  platform: "node",
  tsconfig: "tsconfig.json",
  outExtensions: () => ({ js: ".js" }),
});
