# ADR 0001 — NestJS rather than Go or Rust

**Status:** accepted · **Scope:** Perch · **Reopened 3 times before being settled**

## Context

Building an equivalent of Laravel Filament assumes six preconditions, derived from the analysis of Filament (see `../REF-filament.md`):

1. an ORM that can be introspected at runtime
2. metaprogramming
3. a reactive, server-driven rendering model
4. **a host framework with strong conventions**
5. a package manager and a plugin culture
6. a server-side component engine

Filament reimplements neither auth, nor policies, nor validation, nor migrations, nor queues, nor dependency injection. It **plugs into Laravel**. Precondition 4 therefore carries the heaviest consequences.

## Options

| | Runtime introspection | Host framework | Competition | Audience chasing velocity |
|---|---|---|---|---|
| **Go** | **the best of the three** — `reflect` + struct tags, the closest thing to Eloquent | **none** — Gin, Echo, Chi are routers | weak: GoAdmin on pjax/AdminLTE, QOR under 900 stars | partial |
| **Rust** | the worst — compile time only, no reflection | Loco (~8.9k stars), with no UI layer | axum-admin already exists, SeaORM Pro covers CRUD | **the weakest of the three** |
| **NestJS** | good — decorators + `reflect-metadata`, Prisma DMMF | **yes** — modules, DI, guards, interceptors, CLI | **strong**: Payload ~42k, Refine ~29k, AdminJS ~8k | strong |

## Decision

**NestJS.** Not because Node is superior, but because it is the only ecosystem where you do not have to build the host framework *as well*.

In Go, the scope goes from "a UI framework" to "a web framework **plus** a UI framework" — three times the work, solo. That is the reef the project dies on.

In Rust, two further arguments apply: metaprogramming is compile-time, and **the real competitive moat is the plugin ecosystem** (949+ for Filament) — a codebase heavy in proc macros has a tiny contributor pool, so you would be optimizing against your own advantage. And the "ship fast" promise addresses the smallest possible intersection in a language whose promise is "correctness first".

## Consequences

- Competition is the real risk, not feasibility. The differentiation has to be **depth of Nest integration**: existing guards, DI, modules and policies reused without adaptation.
- A field left empty for ten years in Go is not only an opportunity — it is also a signal about demand. Owned.
- The honest technical argument for Go (native `reflect`) is real, and lost. Offset by Prisma's DMMF (ADR 0002).

## Reopening rule

Three conditions, and nothing else:

1. Milestone **A1** turns out inelegant or slow in TypeScript — an architecture problem rather than a language one, but worth re-examining.
2. A Node competitor ships exactly this product before we do.
3. The real audience turns out to be infra/DevOps rather than product.

**A cheap test is available:** the A1 spike is roughly two days in each language. If doubt persists, write it in Go *and* in TypeScript and let the code settle it — rather than reasoning about it a fourth time.
