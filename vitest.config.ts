import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}", "tooling/**/*.test.ts"],
    // The boundary test shells out to depcruise over the whole workspace.
    testTimeout: 60_000,
    // Node by default: only the renderer needs a DOM, and it asks for one with a
    // `@vitest-environment jsdom` docblock. `environmentMatchGlobs` was removed
    // in Vitest 4, and a per-file docblock says why the file needs a DOM anyway.
    environment: "node",
  },
});
