import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  // Left to itself tsdown picks extensions from the flags it was given, which
  // produced three different layouts across five packages. Pinned instead: `.js`
  // for ESM, which is what `"type": "module"` already means, and `.cjs` for the
  // CommonJS build. These are the paths the exports map names.
  outExtensions: ({ format }) =>
    format === "cjs" ? { js: ".cjs", dts: ".d.cts" } : { js: ".js", dts: ".d.ts" },
});
