# ADR 0002 — Prisma rather than Drizzle

**Status:** accepted · **Scope:** Perch (`@perchjs/prisma`)

## Context

Perch is not an application: it is **a library that reads someone else's schema**. The usual criteria in Prisma/Drizzle comparisons — bundle size, serverless cold start, closeness to SQL — are therefore largely beside the point. Five criteria actually matter.

## Options

| Criterion | Prisma | Drizzle |
|---|---|---|
| **Runtime introspection** | DMMF: complete graph, first-class relations, enums, `@db.VarChar` lengths, **`///` comments → helperText for free** | `getTableConfig` / `getColumns` give columns, indexes, FKs, checks, PKs — but **relations live in a second registry** (`defineRelations()`), and there are no comments |
| **Nested writes** | `create({ data: { addresses: { create: [...] } } })` is literally the `WriteTree` from PRD 01 | **none** — multi-statement transactions to be written by hand |
| **API stability** | DMMF is not public, but Prisma 7 rewrote the Rust engine in TypeScript/WASM **without breaking the client surface** | still at **0.45.x**; v1 removes RQBv1, renames `getTableColumns` → `getColumns`, moves `db.query` → `db._query` |
| Typed paths | generated types | the schema **is** TypeScript, no generation step |
| Market | historically the leader | **overtook Prisma in npm downloads in May 2026** |
| Integration friction | forces `prisma generate` on the user | nothing to generate |

## Decision

**Prisma**, for v1.

**What settles it: nested writes.** Milestone A3 — a Repeater saving a hasMany relation inside a transaction — is blocking. In Prisma it is a direct translation; in Drizzle it is an entire subsystem: insertion order, foreign-key propagation, diffing submitted state against existing rows to decide create/update/delete. Roughly three weeks added to the critical path.

**Secondary factor:** building a public library on a pre-1.0 ORM whose next major renames precisely the two APIs the metadata layer depends on means inflicting a migration on yourself at the worst possible moment.

## What Drizzle wins, honestly

The one point where it clearly wins for an open-source project: **no `generate` step for the user**, a readable TypeScript schema, and a core team employed full time by PlanetScale under Apache 2.0. That is not nothing — it simply weighs less than nested writes.

## Consequences

Two guardrails, non-negotiable and already written into PRD 01:

1. **DMMF access is isolated in a single file** (`dmmf-reader.ts`), with a contract test that fails loudly if the shape changes, and a documented range of Prisma versions.
2. **The `DataAdapter` interface stays the boundary.** It is what makes a Drizzle adapter possible in v0.3 or v1.1 without rewriting the core.

The cost of being wrong is therefore bounded to one package. That is precisely the reason not to agonize over this choice.

## Reopening rule

- Drizzle reaches **stable 1.0** *and* introduces native nested writes → re-evaluate for a second adapter, not for a replacement.
- The DMMF breaks unavoidably between two Prisma versions → the contract test will catch it before users do.
- User demand for Drizzle becomes the majority → write the adapter, keep both.
