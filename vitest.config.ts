import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "tooling/**/*.test.ts"],
    // The boundary test shells out to depcruise over the whole workspace.
    testTimeout: 60_000,
  },
});
