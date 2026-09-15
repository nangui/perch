import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `.generated/` is a build output like `dist/`: a Prisma client written by
    // the generator, not by anybody here. Linting it reports 300 problems
    // nobody can fix without editing a file that is rewritten on every run.
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/.generated/**"],
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
    // Tests may assert on deliberately wrong shapes.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
