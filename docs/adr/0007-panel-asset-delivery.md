# ADR 0007 — Panel asset delivery: `@perchjs/nest` depends on `@perchjs/ui`

**Status:** accepted · **Scope:** Perch

## Context

Two documents describe the same thing and an executable rule forbids it.

- **ARCH 13 §8**: "`@perchjs/ui` is published precompiled. **`PanelModule` serves it statically.** The user configures neither Vite, nor Webpack, nor Tailwind. That is the product promise, not a convenience."
- **PRD 04 §4** specifies the route: `GET {path}/assets/*` → "assets from `@perchjs/ui`".
- **`.dependency-cruiser.cjs`, `no-adapter-to-adapter`**, severity `error`, blocking: `packages/nest/src` cannot reach `packages/ui/`.

So there is no `nest → ui` edge, and `PanelModule` has to serve `ui`'s files.

Three constraints compound it, each one verified:

1. **Resolution.** `.npmrc` deliberately makes an undeclared dependency unresolvable — "this is what stops a package importing what it has not declared". A probe confirms it: from `nest`, any reference to `@perchjs/ui` fails on `not-to-unresolvable`. What blocks today is pnpm's isolation, before the architecture rule even applies.
2. **Manifest.** ARCH 13 §8 requires "hashed filenames, immutable cache". A hashed name obliges `PanelModule` to **read a manifest** to know which file to serve. That is not a constant path, it is data produced by `ui`.
3. **ESM.** `@perchjs/ui` is published as pure ESM (bundler ADR, `attw`: *dynamic import only*). A CommonJS NestJS application cannot `require` it.

## What the probe established

Fixtures placed in `packages/nest/src`, then removed:

| Construct | Edge seen by dependency-cruiser |
|---|---|
| `import` of `ui` **once `ui` is declared** | **yes** — `no-adapter-to-adapter` fires |
| `require.resolve()` of a declared dependency | **no** — no edge created |

The first row was measured under the conditions of the decision rather than today's: `@perchjs/ui` added as a dependency of `nest`, fixture placed, `pnpm install` re-run, then everything restored. Without that the probe proved nothing — `not-to-unresolvable` matched first, and the architecture rule never got to speak.

**The boundary guards imports, not path resolution.** That is what makes the decision below possible, and it is also a blind spot: `require.resolve` followed by a file read crosses the boundary with nothing to report it.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. `nest` declares `ui` as a dependency** | `PanelModule` resolves the package root and serves `dist/` | **kept** — see below |
| **B. The user installs both and passes the path to `forRoot()`** | no edge, rule untouched | rejected: moves plumbing onto the user, which is what the product exists to remove. PRD 04 targets "this configuration + one resource = a working panel", and computing a path inside `node_modules` is not part of it |
| **C. A third package, `@perchjs/panel-assets`** | `nest` depends on it, `ui` publishes into it | rejected: adds a package to publish, version and document, to solve a classification problem rather than a design one |
| **D. `ui` as a `peerDependency` of `nest`** | resolvable, but the version belongs to the host application | rejected **subject to ADR 0008** — see below |

Option D is the mechanism built for "I need this package present, but I do not own its version". It is therefore worth exactly what that freedom is worth — and ADR 0008 proposes to remove it: under lockstep versioning the host application has no version choice to exercise, and the `peerDependency` adds only ceremony and worse error messages when it goes unmet.

**A consequence to own: this line of the present ADR is not decidable on its own.** If ADR 0008 is refused and the packages version independently, D becomes the better answer and the decision below has to be re-read.

## Decision

**`@perchjs/nest` declares `@perchjs/ui` as a dependency, and may import none of its modules.**

The boundary that matters is *"no code coupling"*, not *"no package dependency"*. Serving a file is not importing a module.

1. `@perchjs/ui` becomes a `dependency` of `@perchjs/nest`.
2. The `no-adapter-to-adapter` rule is **unchanged**: any `import` from `nest` into `ui` fails CI, exactly as today.
3. The only permitted use is resolving the package root, then reading `dist/` from the filesystem.
4. **The manifest is a versioned public API**, on the same footing as the renderer props contract (ARCH 13 §7). It carries its version; `PanelModule` refuses to start on a version it does not know rather than serving files at random.
5. Since `require.resolve` is invisible to dependency-cruiser, this permission gets **its own guardrail**: a test that fails if `packages/nest/src` resolves anything other than the root of `@perchjs/ui`. A guardrail nobody has watched fail is not a guardrail — this one is verified like the other thirteen, in `tooling/boundaries.test.ts`.

## Consequences

1. Installing `@perchjs/nest` installs `@perchjs/ui`, and therefore React and Radix. That is owned: the panel **is** the product, and there is no use of it without an interface.
2. `nest` and `ui` versions must move together. This presupposes lockstep versioning across the five packages — **a separate decision, still to be taken**, which this one makes necessary.
3. The manifest format becomes breaking: changing it breaks `PanelModule` silently if nothing checks. Hence point 4 above.
4. An integrator who replaces the renderer keeps `ui` installed without using it. Cost accepted while an alternative renderer stays out of v0.1 scope.
5. The `require.resolve` blind spot is now **documented**, not merely exploited. Any other boundary crossing by that route is a violation, even where CI cannot see it.

## Reopening rule

**Two, and only two:**

1. A second official renderer appears — at which point `nest` can no longer depend on one particular renderer, and option C becomes the right answer.
2. Installed weight becomes a real, measured grievance from users, not a theoretical worry.

A preference for purity about "an adapter does not depend on an adapter" does not reopen this: the rule is about code coupling, and that coupling stays forbidden and verified.
