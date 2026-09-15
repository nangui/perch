import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// `defineConfig` rather than `tseslint.config`, which is deprecated in favour
// of it. Nothing below changes: the same objects, the same `extends`.
export default defineConfig(
  {
    // Build output, none of it written by anybody here: a Prisma client from
    // the generator, and what VitePress leaves behind while building the site.
    // Linting either reports hundreds of problems nobody can fix, in files
    // rewritten on the next run.
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.generated/**",
      "**/.vitepress/cache/**",
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A public framework API surfaces its own types; an implicit `any`
      // crossing the boundary becomes the consumer's problem.
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    // A Nest module is a class with no instance members by construction: the
    // class *is* the injection token, and `forRoot` returns a description rather
    // than an object. The rule is right in general and wrong for this shape.
    files: ["**/*.module.ts"],
    rules: { "@typescript-eslint/no-extraneous-class": "off" },
  },
  {
    // Release tooling: plain Node ESM, outside any tsconfig, so the type-aware
    // rules have nothing to read and the parser must not look for a project.
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: false } },
  },
  {
    // The configuration files belonging to no package. `projectService` looks
    // for the nearest tsconfig.json, finds the solution file at the root,
    // which holds references and no files, and gives up. This names the
    // project that does hold them.
    files: [
      "vitest.config.ts",
      "eslint.config.mjs",
      ".dependency-cruiser.cjs",
      "**/tsdown.config.ts",
      "**/prisma.config.ts",
    ],
    languageOptions: {
      parserOptions: { projectService: false, project: "./tsconfig.root.json" },
    },
  },
  {
    // Tests may assert on deliberately wrong shapes.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
