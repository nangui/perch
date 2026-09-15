/**
 * Proves that the architecture boundaries are actually enforced.
 *
 * A guard nobody has watched fail is not a guard. Each case below writes a
 * deliberately illegal import, runs dependency-cruiser, and asserts both that
 * the expected rule fires *and* that the process exits non-zero — because the
 * exit code is the only thing CI reads.
 *
 * Watch out for one trap, found the hard way: `--output-type json` makes
 * dependency-cruiser exit 0 even when error-severity rules are violated. Only
 * the default reporter sets the exit code. A CI step written against the JSON
 * reporter would report success on every violation, which is why both are
 * checked here.
 */
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEPCRUISE = join(ROOT, "node_modules", ".bin", "depcruise");
const ARGS = ["packages", "--config", ".dependency-cruiser.cjs"];
/**
 * Error-severity rule names, read from the JSON report. Warnings are excluded on
 * purpose: only errors fail CI, and the fixtures below are legitimately orphan
 * modules, which would otherwise drown every assertion in `no-orphans`.
 */
function violatedRules(): string[] {
  const run = spawnSync(DEPCRUISE, [...ARGS, "--output-type", "json"], {
    cwd: ROOT,
    encoding: "utf8",
    // The report is one line per module in the repository and passed a
    // megabyte the day it outgrew the default. Cut there, it arrives as
    // half a JSON document and every assertion below fails on the parse
    // rather than on a boundary.
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.stdout === "" || run.error !== undefined) {
    throw new Error(`depcruise gave no report to read:\n${run.stderr}`);
  }
  const report = JSON.parse(run.stdout) as {
    summary: { violations: { rule: { name: string; severity: string } }[] };
  };
  return [
    ...new Set(
      report.summary.violations
        .filter((v) => v.rule.severity === "error")
        .map((v) => v.rule.name),
    ),
  ];
}

/** Exit code of the reporter CI actually runs. */
function exitCode(): number {
  return spawnSync(DEPCRUISE, ARGS, { cwd: ROOT, encoding: "utf8" }).status ?? -1;
}

const written: string[] = [];

function plant(pkg: string, source: string): void {
  const path = join(ROOT, "packages", pkg, "src", "__boundary_fixture__.ts");
  writeFileSync(path, source, "utf8");
  written.push(path);
}

afterEach(() => {
  for (const path of written.splice(0)) rmSync(path, { force: true });
});

describe("architecture boundaries", () => {
  it("passes on the workspace as committed", () => {
    expect(violatedRules()).toEqual([]);
    expect(exitCode()).toBe(0);
  });

  it("rejects a Node builtin imported by the domain", () => {
    plant(
      "core",
      `import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n`,
    );
    expect(violatedRules()).toContain("core-imports-no-node-builtin");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects an npm package imported by the domain", () => {
    // The headline rule: the domain imports nothing. `vitest/config` is used
    // because a
    // root devDependency is reachable from a package by directory walk-up, so
    // the import resolves and the architecture rule is what stops it — rather
    // than resolution failing first, which is what happens for any package not
    // installed at all.
    plant(
      "core",
      `import { defineConfig } from "vitest/config";\nexport const x = defineConfig;\n`,
    );
    expect(violatedRules()).toContain("core-imports-no-npm-package");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects a runtime module reaching a devDependency", () => {
    plant(
      "prisma",
      `import { defineConfig } from "vitest/config";\nexport const x = defineConfig;\n`,
    );
    expect(violatedRules()).toContain("not-to-dev-dep");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects a sibling package imported by the domain, by name", () => {
    // Unresolvable rather than a core-* rule: @perchjs/prisma is not a
    // dependency of @perchjs/core, so pnpm never links it and resolution fails
    // before any architecture rule is consulted.
    plant("core", `export { PERCH_PRISMA_STATUS } from "@perchjs/prisma";\n`);
    expect(violatedRules()).toContain("not-to-unresolvable");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects a sibling package reached by the domain through a relative path", () => {
    plant("core", `export { PERCH_PRISMA_STATUS } from "../../prisma/src/index.js";\n`);
    expect(violatedRules()).toContain("core-imports-no-sibling-package");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects a type-only import of a forbidden package by the domain", () => {
    // The case tsPreCompilationDeps exists for: erased at runtime, still a
    // dependency of the architecture.
    plant("core", `import type { Stats } from "node:fs";\nexport type S = Stats;\n`);
    expect(violatedRules()).toContain("core-imports-no-node-builtin");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects one adapter importing another by package name", () => {
    // pnpm's isolation is the first line of defence here: @perchjs/prisma is not
    // a dependency of @perchjs/nest, so it is not even linked into its
    // node_modules and the import cannot resolve. The architecture is enforced
    // by the installer before any linter runs. `no-adapter-to-adapter` covers
    // the case where someone adds the dependency to package.json to "fix" this.
    plant("nest", `export { PERCH_PRISMA_STATUS } from "@perchjs/prisma";\n`);
    expect(violatedRules()).toContain("not-to-unresolvable");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects one adapter reaching another through a relative path", () => {
    // The bypass pnpm cannot stop, and the reason the rule exists.
    plant("nest", `export { PERCH_PRISMA_STATUS } from "../../prisma/src/index.js";\n`);
    expect(violatedRules()).toContain("no-adapter-to-adapter");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects the nest adapter importing the renderer it now declares", () => {
    // Before the dependency existed this was caught by resolution,
    // which is a weaker guarantee than it looked: declaring the package removes
    // that accident, and only the architecture rule is left standing.
    plant("nest", `export { PanelForm } from "@perchjs/ui";\n`);
    expect(violatedRules()).toContain("no-adapter-to-adapter");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects a Node builtin in the browser renderer", () => {
    plant("ui", `import { join } from "node:path";\nexport const x = join;\n`);
    expect(violatedRules()).toContain("ui-no-node-builtins");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects reaching a sibling's build output instead of its name", () => {
    plant("nest", `export * from "../../core/dist/index.js";\n`);
    expect(violatedRules()).toContain("no-src-to-dist");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects an import that does not resolve", () => {
    plant("cli", `export * from "./does-not-exist.js";\n`);
    expect(violatedRules()).toContain("not-to-unresolvable");
    expect(exitCode()).not.toBe(0);
  });

  it("rejects the renderer importing a domain value rather than a type", () => {
    // core is a devDependency of @perchjs/ui: a value import compiles here and
    // then breaks for whoever installs the package.
    plant(
      "ui",
      `import { PERCH_CORE_STATUS } from "@perchjs/core";\nexport const x = PERCH_CORE_STATUS;\n`,
    );
    expect(violatedRules()).toContain("ui-imports-core-types-only");
    expect(exitCode()).not.toBe(0);
  });

  it("allows the renderer a type-only import of the domain", () => {
    plant(
      "ui",
      `import type { PERCH_CORE_STATUS } from "@perchjs/core";\nexport type T = typeof PERCH_CORE_STATUS;\n`,
    );
    expect(violatedRules()).toEqual([]);
    expect(exitCode()).toBe(0);
  });

  it("allows an adapter to import the domain", () => {
    plant("prisma", `export { PERCH_CORE_STATUS } from "@perchjs/core";\n`);
    expect(violatedRules()).toEqual([]);
    expect(exitCode()).toBe(0);
  });
});
