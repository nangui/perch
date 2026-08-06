# Reference — Filament taken apart

*A research document. Perch's functional target, and why it works.*
*Surveyed on 4 August 2026, on `filamentphp.com` and its v5 documentation.*

## 1. What it is

Not an admin template: **a complete UI framework for Laravel**.

> "Build apps & admin panels fast, for your bright ideas. With a solid Laravel foundation and a polished UI, you can focus on what makes your product unique."

**Traction:** 31.7K+ GitHub stars · 19.5K+ Discord members · 32.8M+ downloads · **949+ community plugins**. Stable version: v5.

**Base:** the TALL stack — Tailwind, Alpine.js, Laravel, **Livewire**, the last of which Filament describes as *"server-driven reactivity for building dynamic interfaces without writing an API"*.

**A taxonomy in six blocks**: Tables · Forms · Infolists · Notifications · Dashboard widgets · Action modals.

## 2. The four layers

| Layer | Role |
|---|---|
| Panel builder | routing, auth, navigation, clusters, multi-tenancy |
| Resources | *"the heart of your application"* — CRUD for the models, with List / Create / Edit generated out of the box (+ optional View), and the sidebar item registered automatically |
| Schemas | a unified declarative engine — forms, infolists, layouts, and since v4 the structure of the pages themselves |
| Actions & Notifications | modals, confirmations, user feedback |

The decisive technical fact: **every page of a panel is a Livewire component**. You write PHP, you get interactivity without JavaScript.

## 3. The six preconditions

This is the analysis that determined the choice of ecosystem (ADR 0001). Filament is not portable "because it is CRUD" — it rests on a stack:

1. **An ORM that can be introspected at runtime.** `TextColumn::make('author.name')` works because Eloquent resolves relations, casts and attributes dynamically.
2. **Metaprogramming.** PHP attributes, reflection, late static binding → the fluent DSL.
3. **Server-driven reactive rendering.** The hardest pillar to replace.
4. **A host framework with strong conventions.** Filament reimplements neither auth, nor policies, nor migrations, nor queues, nor validation. It plugs into Laravel.
5. **A package manager and a plugin culture.** The real competitive moat.
6. **A server-side component engine.**

**Corollary:** the value proposition is **velocity**. The target ecosystem therefore has to be populated by people who optimize for velocity.

## 4. Two lessons inherited from their mistakes

The two corrections Filament had to make, which became design constraints for us:

| Problem encountered | Filament's correction | Consequence for Perch |
|---|---|---|
| Table cell rendering collapsed at volume — deeply nested Blade components | a **complete rewrite** of rendering in v4 | **flat cell rendering enforced from the first commit** (PRD 07 §2) |
| Splitting the global search term into words collapsed on large datasets | a `$shouldSplitGlobalSearchTerms` option to disable it | **no splitting by default** (PRD 05 §8) |

Taking up the corrections without going through the mistakes is the main advantage of arriving later.

## 5. Competitive landscape

### Node / TypeScript — crowded

| Product | Approach | Its limit |
|---|---|---|
| **AdminJS** (~8k ⭐) | auto-generates from Sequelize, TypeORM, Mongoose or Prisma; integrates with Express, Hapi, Koa, NestJS, Fastify | a black box bolted on beside the app; customization becomes a fight |
| **Refine** (~29k ⭐) | headless | the user writes the frontend |
| **react-admin** | data providers | same |
| **Payload** (~42k ⭐) | code-first, TypeScript config, runs as a Next.js plugin since v3 | a CMS turned framework, tied to Next.js |
| **KeystoneJS** (~10k ⭐) | schema-first, GraphQL | low development activity |

### Rust — an almost open field

- **Loco** (~8.9k ⭐) — "Rails for Rust", generators, SeaORM, jobs, mailers. No UI layer.
- **axum-admin** (2026) — CRUD from entities, MiniJinja SSR, HTMX + Alpine, Casbin RBAC, hooks, ORM-agnostic. Explicitly inspired by Django Admin and Laravel Nova.
- **SeaORM Pro** — full CRUD over SeaORM models, the Plus tier reserved for sponsors.

### Go — empty, and has been for a long time

- **GoAdmin** — still on pjax and AdminLTE themes.
- **QOR Admin** — under 900 stars.
- **go-advanced-admin** — nascent.

A field left empty for ten years is not only an opportunity.

## 6. Business model observed

Useful for knowing what has market value — see PRD 11 §6.

| Lever | What Filament does |
|---|---|
| Tiered sponsorship | GitHub Sponsors — Agency Partner, Gold, Silver, Bronze; logos on the site and in the documentation |
| **Paid official plugins** | sells *Custom Dashboards* (drag-and-drop dashboards) while keeping the framework free |
| Third-party plugin market | hosts the catalog of 949+ plugins without taking a commission |
| Consulting | a dedicated page, a network of partner agencies |
| Shop | merchandise |

**The most informative signal:** what they choose to sell. Drag-and-drop configurable dashboards are therefore outside Perch's core (PRD 09), and listed as a commercial candidate.

## 7. What actually makes their moat

A testimonial from the site, more revealing than the figures:

> Whenever you run into something not already in the framework, the community has almost always solved the problem with a plugin.

**949+ plugins is not a consequence of success, it is the cause.** Hence the decision to design the extensibility contract in v0.1 even though the public API only arrives in v2 — it is the one thing in the whole project that cannot be retrofitted.
