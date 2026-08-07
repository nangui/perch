# ADR 0008 — Versioning policy: the five packages move together

**Status:** accepted · **Scope:** Perch

## Context

Five publishable packages — only the root is `private` — all at `0.0.0`. No release tooling, no CHANGELOG, no written semver rule. The first `npm publish` decides the question by accident if nothing decides it first.

The repository already leans, in two places:

- **PRD 00 §6** assigns every feature to a version *of the product* — v0.1, v0.2, v0.3 — over roughly a hundred rows. Never to a package version.
- **PRD 03 §8** mitigates the risk "the renderer becomes a second project to maintain" with "component scope closed and **versioned with the core**".

And ADR 0007 adds a constraint: `@perchjs/nest` depends on `@perchjs/ui`, so the two have to move together.

## What verification established

Two facts measured rather than assumed, against the current state of the repository:

1. **`workspace:*` becomes an exact pin at publish**, not a range. A `pnpm pack` of `@perchjs/nest` yields `"@perchjs/core": "0.0.0"` in the tarball — not `^0.0.0`.
2. **`@perchjs/ui` has no runtime dependency on `@perchjs/core` at all.** It holds it as a `devDependency`, because ARCH 12 grants it types only, and types are erased at build. A version skew between the two would therefore be **invisible at install time**: nothing in the npm registry would report it.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Lockstep** | the five always carry the same number and are published together | **kept** |
| **B. Independent** | each package moves at its own pace | rejected: the roadmap is written per version *of the product*, and "Perch 0.2" is the unit a plugin author can name (PRD 11). `@perchjs/core@0.4.1` + `@perchjs/nest@0.2.3` tells them nothing |
| **C. Hybrid** — core locked, periphery free | fewer empty releases | rejected, but it is the serious option — see below |

**The hybrid deserves more than one line, because the target ecosystem practices it.** Read off the registry: `@nestjs/core` and `@nestjs/common` are both at `11.1.28`, while `@nestjs/config` is at `4.0.4`. NestJS locks its core and lets its satellites run free.

What makes the precedent inapplicable here: **Perch has no satellite.** `@nestjs/config` is optional, plenty of applications never install it, and it has its own lifecycle. All five Perch packages are core — three or four of them are needed to get a working panel, and none has a reason to move alone. The day a satellite exists — a `@perchjs/drizzle`, a community plugin — the NestJS precedent becomes the right answer **for it**, and that is exactly the first reopening rule below.

## Decision

**The five packages always carry the same version number and are published together**, including those unchanged in that release.

1. **First published version: `0.1.0`**, per the roadmap. `0.0.0` is never published.
2. **Before 1.0, minor is breaking.** npm reads `^0.2.3` as `>=0.2.3 <0.3.0`: a `^0.2.0` does not admit `0.3.0`. The v0.1 → v0.2 → v0.3 tiers therefore land on minors, and that is deliberate, not a side effect.
3. **Internal dependencies stay `workspace:*`.** The exact pin it produces is correct here precisely because the versions it pins are always published together; under an independent policy it would be a trap.
4. **One CHANGELOG, at the root.** Five files describing the same release are noise.
5. **Tooling: Changesets**, with a `fixed` group covering `@perchjs/*`. That is implementation: changing it does not reopen this ADR, abandoning lockstep does.

## Consequences

1. A fix in `cli` bumps all five numbers. Four packages change version without changing content. **Cost accepted** — read off the registry: `@angular/core`, `@angular/common` and `@angular/forms` are all at `22.1.0`; `prisma` and `@prisma/client` both at `7.9.1`. The alternative costs more in confusion than it saves in numbers.
2. The `ui` / `core` skew, which nothing would detect at install time, becomes structurally impossible. That is a reason for the decision, not a by-product of it.
3. Publishing becomes all-or-nothing: a release interrupted midway leaves the registry inconsistent. `pnpm publish -r` covers the nominal case; a partial failure needs manual reconciliation.
4. A plugin author can write one constraint — "requires Perch ≥ 0.2" — instead of a matrix.
5. Adds `@changesets/cli` as a devDependency, and a release workflow.

## Reopening rule

**Two, and only two:**

1. **A package acquires a genuinely distinct lifecycle** — a second official renderer, or an adapter maintained by the community on another cadence, a `@perchjs/drizzle` for instance. The question then reopens for that package, not for the five.
2. **Lockstep forces empty releases weekly** rather than occasionally, measured over at least ten releases.

Does not reopen this: aesthetic discomfort at a number rising without content. That is the known price, and it is paid knowingly.
