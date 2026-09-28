import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `examples` is here because it was not, and the example's own storage
    // adapter had therefore never been run by anything: the panel's suites bring
    // disks of their own, so nothing reached the one a reader copies from.
    include: [
      "packages/*/src/**/*.test.{ts,tsx}",
      "tooling/**/*.test.ts",
      "examples/*/src/**/*.test.ts",
    ],
    // Built once, before the first worker: four proofs read what the packages
    // publish, and four of them checking and building for themselves is a race
    // on a cold tree rather than four careful tests.
    globalSetup: ["tooling/ensure-build.ts"],
    // The boundary test shells out to depcruise over the whole workspace.
    testTimeout: 60_000,
    // Node by default: only the renderer needs a DOM, and it asks for one with a
    // `@vitest-environment jsdom` docblock. `environmentMatchGlobs` was removed
    // in Vitest 4, and a per-file docblock says why the file needs a DOM anyway.
    environment: "node",
  },
});
