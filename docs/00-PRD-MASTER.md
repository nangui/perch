# PRD 00 — Master · The Perch project

> An open-source UI framework for NestJS. Define a resource in TypeScript, get a full panel, never write any front-end.

| | |
|---|---|
| **Name** | **Perch** — npm scope `@perchjs/*` reserved · trademark to file (see §14) |
| **Status** | Draft v1 — pre-implementation |
| **Product goal** | Build apps & admin panels fast — delivery velocity |
| **Target stack** | NestJS + Prisma + PostgreSQL + React |
| **Intended license** | MIT (core) |

---

## 1. Reference: what Filament does

Filament is the functional target to match. It is not an admin template, it is a complete UI framework for Laravel.

**Traction observed (official site, 2026)**: 31.7K+ GitHub stars · 19.5K+ Discord members · 32.8M+ downloads · **949+ community plugins**. Stable version: v5.

**Its promise**: "Build apps & admin panels fast, for your bright ideas. With a solid Laravel foundation and a polished UI, you can focus on what makes your product unique."

**Its technical base**: the TALL stack — Tailwind, Alpine.js, Laravel, **Livewire**. Filament describes Livewire as *"server-driven reactivity for building dynamic interfaces without writing an API"*. That is the pillar to reproduce, not the cosmetic layer.

**Its functional taxonomy** (6 blocks announced on the home page): Tables · Forms · Infolists · Notifications · Dashboard widgets · Action modals.

## 2. Problem

A Node/Nest backend developer who has to ship a back-office has three bad options:

1. **AdminJS** — auto-generates from the models, but it is a black box bolted onto the app. As soon as the need leaves CRUD, you are fighting the tool.
2. **Refine / react-admin** — powerful, but the user has to write the frontend. The cost is moved, not removed.
3. **Payload** — excellent, but it is a CMS turned framework, tied to Next.js, with its own data model.

None offers the Filament experience: **I describe my UI in the backend, in my framework, with my conventions, and the UI is reactive without my writing any JavaScript.**

## 3. Value proposition

> **Define a resource in TypeScript. Get a full panel. Never write any front-end.**

**Differentiation against each competitor:**

| Competitor | Its limit | Our answer |
|---|---|---|
| AdminJS | black box, customization = a fight | everything overridable by composition (the Schemas model) |
| Refine / react-admin | the user writes the front-end | the user writes backend only |
| Payload | CMS-first, Next.js-first | Nest-first, fits into the existing Nest app |
| Directus / Strapi | imposed data model | your Prisma schema is the source of truth |

## 4. Personas

| # | Persona | Need | Success criterion |
|---|---|---|---|
| P1 | **Solo Nest backend dev / small team** | ship a back-office in days, not weeks | first usable CRUD in < 15 min |
| P2 | **Product team with an existing Nest app** | add a panel without rewriting auth or the data model | plugs into existing Nest guards with no adapter code |
| P3 | **Plugin author** (v2+) | extend other people's panels | publishes an npm package injecting fields/pages/actions |
| P4 | **End user of the panel** (non-dev) | a fast, clear interface without jank | a 10k-row table stays fluid, forms stay reactive |

## 5. Guiding principles (non-negotiable)

1. **State is authoritative on the server.** That is the essence of Livewire, and therefore of Filament. The client is a renderer, not the source of truth.
2. **Zero JavaScript asked of the user** across the whole covered scope.
3. **Composition, not configuration.** Every object is an immutable, overridable builder. No "magic" boolean option that blocks extension.
4. **Reuse Nest, do not reimplement it.** Auth, guards, DI, validation, modules, logging: we plug in, we do not recreate.
5. **Prisma is the source of truth for the data model.** We never introduce a second schema.
6. **Type safety end to end.** An invalid field path must fail at compile time, not at runtime.
7. **The extensibility contract is designed in v0.1**, even though plugins only arrive in v2. You do not retrofit a plugin architecture.

## 6. Exhaustive Filament inventory → Perch decisions

Complete scope taken from the official documentation (v4.x/5.x), with the tier it is assigned to.

### 6.1 Panel & configuration

| Filament feature | Decision | Tier | PRD |
|---|---|---|---|
| Panel configuration (id, path, colors, brand) | Adopt, via `PanelModule.forRoot()` | v0.1 | 04 |
| Multiple panels in one app | Adopt | v0.3 | 04 |
| Navigation: sidebar, groups, sorting, badges | Adopt | v0.1 | 04 |
| Navigation: Clusters (grouping resources) | Adopt | v0.3 | 04 |
| User menu | Adopt | v0.2 | 04 |
| Custom pages (free canvas) | Adopt | v0.2 | 04 |
| Auth: login, register, password reset, email verify | **Do not reproduce** — plug into Nest guards | v0.1 | 04 |
| Auth: MFA / 2FA | Out of scope, left to the host app | — | — |
| Multi-tenancy with automatic query scoping | Adopt (architecture planned from v0.1) | v0.3 | 04 |
| Global search (across resources) | Adopt | v0.3 | 05 |
| Render hooks (content injection by position) | Adopt — key for plugins | v0.2 | 11 |
| Registering assets (plugin CSS/JS) | Adopt | v0.2 | 11 |
| Modular architecture (DDD) | Native: Nest modules already do it | v0.1 | 04 |
| Deployment guide | Docs | v0.2 | — |

### 6.2 Resources

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| Generated List / Create / Edit pages | Adopt | v0.1 | 05 |
| View page (read-only, infolist) | Adopt | v0.2 | 05 |
| Deleting + soft deletes + restore / force delete | Adopt | v0.2 | 05 |
| Managing relationships (relation managers) | Adopt | v0.2 | 05 |
| Nested resources (parent/child, routing + breadcrumbs) | Adopt | v0.3 | 05 |
| Singular resources (a single instance, e.g. Settings) | Adopt | v0.3 | 05 |
| Widgets on resource pages | Adopt | v0.3 | 09 |
| Custom resource pages | Adopt | v0.2 | 05 |
| Configurable redirect after creation | Adopt | v0.2 | 05 |

### 6.3 Schemas (the declarative engine)

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| Unified component tree (forms + infolists + layout) | **Core.** Adopt in full | v0.1 | 02 |
| Layouts: Grid, responsive columns, `columnSpan` | Adopt | v0.1 | 02 |
| Sections (collapsible, with description, icon) | Adopt | v0.1 | 02 |
| Tabs | Adopt | v0.2 | 02 |
| Wizards (multi-step forms) | Adopt | v0.3 | 02 |
| Callouts | Adopt | v0.2 | 02 |
| Empty states | Adopt | v0.2 | 02 |
| Prime components (static text, image, icon) | Adopt | v0.2 | 02 |
| Custom components (React escape hatch) | Adopt | v0.2 | 03 |
| Page schema (`content()` — schema-driven page structure) | Adopt — a major addition in v4 | v0.3 | 04 |

### 6.4 Forms — field catalog

| Filament field | Tier | Filament field | Tier |
|---|---|---|---|
| TextInput | v0.1 | Repeater | v0.2 |
| Textarea | v0.1 | Builder (polymorphic blocks) | v0.3 |
| Select (+ relationship, searchable, multiple, createOption) | v0.1 | TagsInput | v0.2 |
| Checkbox | v0.1 | KeyValue | v0.2 |
| Toggle | v0.1 | ColorPicker | v0.2 |
| Radio | v0.1 | ToggleButtons | v0.2 |
| CheckboxList | v0.2 | Slider | v0.3 |
| DateTimePicker | v0.1 | CodeEditor | v0.3 |
| FileUpload | v0.1 | Hidden | v0.1 |
| RichEditor (Filament v4: TipTap, not Trix) | v0.2 | MarkdownEditor | v0.2 |
| Custom fields (extension API) | v0.2 | Validation | v0.1 |

Detail of the cross-cutting behaviors (`->required()`, `->live()`, `->visible()`, `->disabled()`, `->helperText()`, `->default()`, `->afterStateUpdated()`, `->dehydrated()`): see PRD 06.

### 6.5 Tables

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| Columns: Text, Icon, Image, Color, Select, Toggle, Checkbox | v0.1 (Text, Icon) / v0.2 (the rest) | | 07 |
| Relation columns (`user.email`) | Adopt | v0.1 | 07 |
| Search (global + per column), sorting | Adopt | v0.1 | 07 |
| Pagination | Adopt | v0.1 | 07 |
| Filters: Select, Ternary, Date range, Query builder | v0.1 (Select, Text) / v0.2 / v0.3 | | 07 |
| Row actions + bulk actions | Adopt | v0.1 | 07 |
| Responsive layout (split, stack, panels) | Adopt | v0.2 | 07 |
| Summaries (aggregates in the column footer) | Adopt | v0.3 | 07 |
| Grouping rows | Adopt | v0.3 | 07 |
| Configurable empty state | Adopt | v0.2 | 07 |
| Custom data (non-ORM source: API, array) | Adopt | v0.3 | 07 |
| Drag-and-drop reordering | Adopt | v0.3 | 07 |
| **Perf**: Filament v4 rewrote cell rendering for large tables | A design constraint from v0.1 | v0.1 | 07 |

### 6.6 Actions & Notifications

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| Actions: Create, Edit, View, Delete | v0.1 | | 08 |
| Actions: Replicate, ForceDelete, Restore | v0.2 | | 08 |
| Actions: Import / Export (CSV) | v0.3 | | 08 |
| Modals: confirmation, form, slide-over | v0.1 | | 08 |
| Grouping actions (dropdown) | v0.2 | | 08 |
| Per-action authorization | v0.1 | | 08 |
| Synchronous or queued execution | v0.3 | | 08 |
| In-app notifications (toast) | v0.1 | | 08 |
| Notifications persisted in the database | v0.3 | | 08 |
| Broadcast notifications (real time) | v0.3 | | 08 |

### 6.7 Infolists & Widgets

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| Entries: Text, Icon, Image, Color, Code, KeyValue, Repeatable | v0.2 | | 09 |
| Custom entries | v0.2 | | 09 |
| Widgets: Stats overview | v0.3 | | 09 |
| Widgets: Charts | v0.3 | | 09 |
| Widgets: Table widget | v0.3 | | 09 |
| Configurable dashboard | v0.3 | | 09 |
| Drag-and-drop dashboards | **Out of scope** — it is a paid plugin at Filament | v2+ | 11 |

### 6.8 Styling, Testing, DX

| Feature | Decision | Tier | PRD |
|---|---|---|---|
| One polished theme | v0.1 | | 03 |
| Configurable colors / icons | v0.2 | | 03 |
| CSS hooks (stable classes for overriding) | v0.2 | | 03 |
| Dark mode | v0.1 | | 03 |
| Custom themes | v0.3 | | 03 |
| Test helpers (resources, tables, schemas, actions) | v0.2 | | 10 |
| Generation CLI (`nest g panel-resource`) | v0.1 | | 10 |
| Docs + upgrade guide | v0.2 | | — |
| Use outside a panel (standalone components) | **Out of scope for v1** | v2+ | — |

## 7. Architecture — monorepo, 5 packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@perchjs/core` | schema engine: `Component`, `Field`, `Column`, `Action`, state resolution, validation. **No Nest or Prisma dependency.** | — |
| `@perchjs/prisma` | metadata adapter (DMMF → IR) + query execution | core |
| `@perchjs/nest` | `PanelModule`: resource discovery, routing, guards, tenancy | core |
| `@perchjs/ui` | React renderer + field registry (shipped compiled) | core (types only) |
| `@perchjs/cli` | code generation | core |

The `core` ↔ `prisma` boundary is what will allow Drizzle to be added later without a rewrite. **We do not implement it in v0.1, and we never cross it.**

## 8. Roadmap by tier

| Tier | Name | Content | Exit criterion |
|---|---|---|---|
| **v0.1** | *Spike* | Prisma+Postgres · List/Create/Edit CRUD · 10 fields · belongsTo/hasMany · select+text filters · row+bulk actions · modals · toast notifications · auth plugged in · 1 theme | The 4 acceptance criteria in §9 pass |
| **v0.2** | *Usable* | View page + infolists · relation managers · soft deletes · Repeater · Tabs · custom pages · render hooks · custom fields · test helpers · docs | A third party builds a real panel unaided |
| **v0.3** | *Complete* | tenancy · global search · widgets/dashboard · wizards · Builder · summaries · grouping · import/export · nested & singular resources · themes | Functional parity ≈ Filament v3 |
| **v1.0** | *Stable* | API frozen · upgrade guide · perf validated at 100k rows | Public stability commitment |
| **v2+** | *Ecosystem* | public plugin API · registry · commercial surface | See PRD 11 |

## 9. v0.1 acceptance criteria (the 4 hard cases)

These are the milestones. Each validates one architecture decision. **In this order.**

| # | Case | Validates | Blocking |
|---|---|---|---|
| **A1** | Reactive dependent select, country → city, zero user JavaScript | the state protocol | **Yes — if A1 is not elegant, redesign the protocol before anything else** |
| **A2** | Table: relation column + filter + bulk action + confirmation modal | the query layer | Yes |
| **A3** | Nested Repeater saving a hasMany relation in a transaction | the schema tree + persistence | Yes |
| **A4** | A third-party Nest module injects a field into an existing resource | extensibility | Yes — without A4, no ecosystem is possible |

## 10. Success metrics

| Metric | v0.2 target | v1.0 target |
|---|---|---|
| Time-to-first-CRUD (developer who has never seen the tool) | < 15 min | < 10 min |
| Lines of user code for a complete CRUD | < 40 | < 30 |
| Lines of JavaScript written by the user | **0** | **0** |
| p95 latency of a reactive state round trip | < 150 ms | < 80 ms |
| Rendering a paginated 10k-row table | < 300 ms | < 150 ms |
| GitHub stars | 500 | 5,000 |
| Third-party plugins | 0 (API not published) | 10 |

## 11. Monetization surface — **out of current scope**

Documented so the architecture does not close it off, not to be built. The model observed at Filament:

1. **Third-party sponsorship** (Agency Partner / Gold / Silver / Bronze) through GitHub Sponsors — the core stays MIT.
2. **Paid official plugins.** Filament sells, for instance, its *Custom Dashboards* plugin (drag-and-drop dashboards) while keeping the framework free.
3. **A third-party plugin market**, including commercial plugins (enriched tables, command palette, and so on). Filament hosts the catalog but does not sell.
4. **Consulting** and a **shop** (merchandise).

**Decision**: the core stays MIT and complete. Any future monetization goes through plugins, never through mutilating the core. **Immediate architectural consequence**: the extensibility contract (PRD 11) has to be designed in v0.1 — it is the one thing that cannot be retrofitted.

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The state protocol does not hold up under load or latency | Fatal | A1 as the first milestone; explicit latency budget |
| The DSL is ugly and nobody likes it | Fatal | Write the target `UserResource` file **before** any engine |
| Scope drift toward a CMS | High | Non-goals written in the README from day one |
| Type safety of field paths is too complex | Medium | Fallback: weakly typed `string` in v0.1, hardened in v0.2 |
| Competition (Payload, Refine, AdminJS) | Medium | Nest-native positioning, not head-on |
| The "Perch" trademark is unavailable | Low | Check npm + INPI/USPTO before publication |

## 13. Non-goals — v1.0

Written in the README from the first commit:

- This is **not a CMS** (no content management, no content API, no multi-project support).
- This is **not a visual builder** (no drag-and-drop of fields, no click-to-generate UI).
- This is **not multi-ORM** in v1 (Prisma only).
- This is **not multi-database** in v1 (PostgreSQL only).
- This is **not a replacement** for the host app's auth.
- No GraphQL, no Mongo, no i18n in v0.1.

## 14. Name, trademark and defense

### 14.1 Decision

**Perch.** A bird's perch: the vantage point over your data.

The guiding naming principle, learned the hard way: **a dev-tool name does not carry the product's thesis.** Filament does not say "admin panel" — it says "incandescent thread", and it is the light bulb in the logo plus the tagline *"for your bright ideas"* that carry the meaning. Prisma splits light. Keystone holds the arch. The name carries an **image you can own**; the logo and the tagline carry the argument.

Criteria adopted: ownable · short and easy to say aloud · npm scope free · **not semantically wrong**. Nothing more. Demanding that a name make the argument produces three-leap metaphors nobody decodes.

### 14.2 Residual risk, owned

"Perch" connotes observation, not construction — it narrows toward the dashboard while the product aims at "build apps". **The tagline has to carry the missing half:**

> **Perch** — the lookout over your Nest app.
> Declare it in TypeScript. Watch it appear.

The second line does the work the name does not. It is not optional.

### 14.3 Rhetorical defense

- **One line of origin in the README**, never more. One "Why the name?" entry in the FAQ.
- **Never debate a name in a PR thread.** Bikeshedding over names is endless and goes nowhere. One reply only: a link to the FAQ.
- The name is a **closed decision**, not an open proposal. Say so explicitly in `CONTRIBUTING.md`.

### 14.4 Practical defense — in priority order

| # | Action | Cost | Urgency |
|---|---|---|---|
| 1 | Reserve the npm organization `perchjs` and publish a placeholder `@perchjs/core@0.0.0` | 5 min | **today** |
| 2 | Trademark clearance search, **classes 9 and 42**, FR (INPI) + EU (EUIPO) + US (USPTO) | a few hours | **before any line of code** |
| 3 | Check the status of the PHP CMS of the same name: live or dormant mark, and in which class | 1 h | before filing |
| 4 | GitHub organization, `.dev` domain, social handles | 1 h | week 1 |
| 5 | Actual trademark filing | depends on jurisdiction | before the public v0.1 |
| 6 | `TRADEMARK.md` in the repository | 1 h | before opening up plugins |

**Decision rule on prior marks:** if a live trademark is registered in class 9 or 42 in your target markets, **rename now**. Renaming costs two hours today and several months after the first thousand users.

*(This is not legal advice — I am not a lawyer. A clearance search by a trademark attorney before filing remains the only reliable check.)*

### 14.5 Trademark policy (`TRADEMARK.md`)

To be written before opening the plugin API, not after — Filament has one, and it is what makes it possible to ask politely for a rename without conflict.

| Use | Allowed |
|---|---|
| "Perch plugin for X", "Perch-compatible" | ✅ |
| `perch-plugin-x` on npm | ✅ |
| A fork named "Perch" | ❌ |
| A commercial product named "Perch Pro", "Perch Cloud" | ❌ |
| The logo, modified | ❌ |

### 14.6 Fallback

If the clearance search blocks the name: **Facet** — a crystal's visible face exists *because of* the internal lattice. The `@facet` scope is **unavailable**: a `facet` package exists, and npm refuses an organization matching a package name. Known risk: category collision with faceted search, common in data tooling.

## 15. Index of PRDs

| PRD | Title | Main tier |
|---|---|---|
| 01 | Metadata layer (Prisma → IR) | v0.1 |
| 02 | Schema engine | v0.1 |
| 03 | State protocol & UI renderer | v0.1 |
| 04 | Nest PanelModule: routing, auth, navigation | v0.1 |
| 05 | Resources & CRUD pages | v0.1 |
| 06 | Forms: field catalog | v0.1 → v0.3 |
| 07 | Table builder | v0.1 → v0.3 |
| 08 | Actions, modals & notifications | v0.1 |
| 09 | Infolists, widgets & dashboard | v0.2 → v0.3 |
| 10 | CLI, codegen & testing | v0.1 |
| 11 | Extensibility, plugins & ecosystem | v0.1 (contract) → v2 (public) |
