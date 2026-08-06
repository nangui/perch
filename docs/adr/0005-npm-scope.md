# ADR 0005 — npm scope: `@perchjs`, not `@perch`

**Status:** accepted · **Scope:** Perch

*Supersedes [ADR 0004](0004-naming.md) on the single point of npm availability. The naming decision itself is not reopened.*

## Context

ADR 0004 holds four naming criteria, the third being: **npm scope free**. Its availability table gave `@perch` as "free", checked in August 2026.

At the point of creating the organization, npm refused it.

## What the check had missed

**npm refuses an organization name that matches an existing package.** A package named `perch` was published in 2016; the name is therefore unavailable as an organization, whatever a scope search reports.

The check was asking the wrong question. It asked *"does the `@perch` scope contain any packages?"* — the answer was no, and it was irrelevant. The right question is *"does a package named `perch` exist?"*

ADR 0004 in fact carried its own warning, without drawing this consequence from it: *"Zero search results does not prove a scope is unreserved without a publication."*

## Decision

**The publishing scope is `@perchjs`.** The organization is created.

| | |
|---|---|
| Product name | **Perch** — unchanged |
| Repository | `github.com/nangui/perch` — unchanged |
| Tagline, logo, thesis | unchanged |
| npm scope | `@perchjs/*` |

The packages become `@perchjs/core`, `@perchjs/prisma`, `@perchjs/nest`, `@perchjs/ui`, `@perchjs/cli`.

**What settled it:** the product name and the publishing scope are two distinct decisions, which ADR 0004's third criterion conflated. The scope is plumbing — it is neither the ownable image nor the argument. Renaming the product over a registry conflict would have thrown away a finished analysis whose internal contradiction about the name is identified and resolved.

The precedent is in the product's own ecosystem: **NestJS publishes under `@nestjs`, not `@nest`.** Angular under `@angular`, Vue under `@vue`. The detour is the norm, not the exception.

## Correcting ADR 0004's table

An ADR is never edited. This one therefore corrects the facts without touching it:

| Name | ADR 0004 said | Registry reality |
|---|---|---|
| `perch` | scope **free** · dead squat v1.0.0 **from 2022** | organization **refused** · package v1.0.0 from **2016** |
| `facet` | scope free · abandoned v0.5.0 **from 2022** | organization **refused** — package `facet` exists · v0.5.0 from **2022** |

**Consequence for the fallback:** `@facet` was no more available. The fallback recorded in ADR 0004 would not have solved the problem that motivated the present ADR.

## Consequences

1. ADR 0004's "npm scope free" criterion now reads: **no package bears this name.** That is the only verifiable phrasing.
2. A product name is no longer disqualified by an unavailable scope: the suffix is a normal remedy.
3. `npm publish` requires `"publishConfig": {"access": "public"}` in every scoped package, failing which npm asks for a paid plan.

## Reopening rule

**One only:** npm frees the name `perch` — the 2016 package removed, or transferred. The scope would then move to `@perch`, with `@perchjs` kept as a deprecated alias.

No aesthetic preference about `perchjs` reopens this. The product name stays governed by ADR 0004 and its own reopening rule.
