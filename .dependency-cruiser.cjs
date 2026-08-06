/**
 * Enforces the dependency rule of ARCH 12 §1: arrows only ever point inward.
 *
 * This file is the executable form of that architecture decision. It blocks CI.
 * Without it, the boundary is a convention, and a convention is what a deadline
 * breaks first.
 *
 * `tsPreCompilationDeps: true` is what makes `import type` visible to the
 * cruiser. Without it a type-only import of NestJS inside the domain would pass
 * unnoticed, and the rules below would be theatre.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- domain
    {
      name: "core-imports-no-npm-package",
      comment:
        "ARCH 12 §1: the domain imports nothing. Not NestJS, not Prisma, not " +
        "React, not Express. This is what makes a Drizzle or Fastify adapter " +
        "possible later without a rewrite, and the domain testable without a " +
        "database.",
      severity: "error",
      from: { path: "^packages/core/src", pathNot: "\\.(spec|test)\\.ts$" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-no-pkg"],
        pathNot: "^packages/core/",
      },
    },
    {
      name: "core-imports-no-node-builtin",
      comment:
        "ARCH 12 §1: 'imports nothing' includes the Node runtime. A domain that " +
        "reaches for fs, path or crypto is no longer portable, and a Resolver " +
        "that does its own I/O breaks the rule of ARCH 12 §3 — it receives a " +
        "ResolverContext instead.",
      severity: "error",
      from: { path: "^packages/core/src", pathNot: "\\.(spec|test)\\.ts$" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "core-imports-no-sibling-package",
      comment:
        "ARCH 12 §1: the domain sits at the centre. It cannot depend on any " +
        "other workspace package, whatever the direction of the import looks " +
        "like at the file level.",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { path: "^packages/(?!core/)" },
    },

    // --------------------------------------------------- adapter ↮ adapter
    {
      name: "no-adapter-to-adapter",
      comment:
        "ARCH 12 §1: an adapter never imports another adapter. In particular " +
        "@perchjs/nest reaches data through the DataAdapter port, never " +
        "through @perchjs/prisma (PRD 04 §7).",
      severity: "error",
      from: { path: "^packages/(prisma|nest|ui|cli)/src" },
      to: {
        // `$1` is the group captured in `from.path`: an adapter may reach its
        // own files, never a sibling adapter's.
        path: "^packages/(prisma|nest|ui|cli)/",
        pathNot: "^packages/$1/",
      },
    },

    // ------------------------------------------------------------------ ui
    {
      name: "ui-has-no-server-dependency",
      comment:
        "ARCH 13: the renderer ships precompiled to a browser. NestJS, Prisma " +
        "and Node built-ins have no business in that bundle.",
      severity: "error",
      from: { path: "^packages/ui/src" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-peer"],
        path: "^(@nestjs/|@prisma/|prisma$|express$)",
      },
    },
    {
      name: "ui-imports-core-types-only",
      comment:
        "ARCH 12 §1 lists @perchjs/ui as depending on 'core (types only)', which " +
        "is why core sits in its devDependencies. A value import would compile " +
        "here and then fail for whoever installs @perchjs/ui, since core is not " +
        "a runtime dependency of it — and it would drag domain code into a " +
        "browser bundle.",
      severity: "error",
      from: { path: "^packages/ui/src", pathNot: "\\.(spec|test)\\.ts$" },
      to: { path: "^packages/core/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "ui-no-node-builtins",
      comment: "ARCH 13: the renderer runs in a browser. No Node core modules.",
      severity: "error",
      from: { path: "^packages/ui/src" },
      to: { dependencyTypes: ["core"] },
    },

    // ------------------------------------------------------------- hygiene
    {
      name: "no-circular",
      comment:
        "A cycle means the layering has been broken somewhere, even when every " +
        "individual import looks defensible.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Dead module: either wire it up or delete it.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          // Package entry points: nothing inside the repo imports them.
          "^packages/[^/]+/src/index\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-dev-dep",
      comment:
        "A runtime module must not reach a dependency that is *only* a " +
        "devDependency: it would be missing for whoever installs the published " +
        "package. `dependencyTypesNot` is what makes this usable in a component " +
        "library — React is correctly both a peerDependency, since the consumer " +
        "provides it, and a devDependency, since building and testing need it " +
        "here. Without the exclusion the rule fires on every correct React " +
        "import.",
      severity: "error",
      from: { path: "^packages/[^/]+/src", pathNot: "\\.(spec|test)\\.tsx?$" },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["npm", "npm-peer", "npm-optional"],
        pathNot: "^packages/",
      },
    },
    {
      name: "no-non-package-json",
      comment: "Dependency used but not declared in that package's package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-unresolvable",
      comment: "Import that does not resolve — a typo or a missing dependency.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-src-to-dist",
      comment:
        "Reach a sibling package through its name, never through a relative " +
        "path into its build output: a stale dist silently hides a broken " +
        "contract. Restricted to `local` dependencies on purpose — importing " +
        "`@perchjs/core` by name legitimately resolves into its dist, because " +
        "that is what the exports map publishes. Without this restriction the " +
        "rule would forbid every correct cross-package import.",
      severity: "error",
      from: { path: "^packages/[^/]+/src" },
      to: { dependencyTypes: ["local"], path: "^packages/[^/]+/dist" },
    },
  ],

  options: {
    // `doNotFollow`, not `exclude`: generated output must stay *visible as a
    // target* so `no-src-to-dist` can fire, while never being traversed as
    // source. Excluding it outright made that rule unreachable — a dead rule
    // reads like a guard and protects nothing.
    doNotFollow: { path: "(^|/)(node_modules|dist|\\.tsbuild)(/|$)" },
    exclude: { path: "(^|/)coverage/" },
    moduleSystems: ["es6", "cjs"],

    // Makes `import type` visible. Without this the domain rules are theatre.
    tsPreCompilationDeps: true,

    // Required in a workspace: resolves dependencies declared in each package.
    combinedDependencies: true,

    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs"],
    },
    preserveSymlinks: false,
    cache: false,
  },
};
