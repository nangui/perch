# PRD 03 — State protocol & UI renderer (`@perchjs/ui`)

**Tier:** v0.1 · **Depends on:** PRD 02 · **Unblocks:** A1, A2

## 1. Objective

Replace Livewire. Filament describes Livewire as *"server-driven reactivity for building dynamic interfaces without writing an API"*, and states that **every page of a panel is a Livewire component**. That behavior is what has to be obtained, not its implementation.

**Central architecture decision:** we keep **Livewire's essence** (state is authoritative on the server) and take **a JSON transport + React renderer** (the pragmatic route, Payload's). We do not reimplement DOM diffing.

## 2. Why this choice

| Option | Benefit | Cost | Verdict |
|---|---|---|---|
| React renderer driven by a JSON schema | type-safe end to end, React ecosystem, debuggable | a renderer has to be written | **kept** |
| Server-driven HTML (HTMX/Datastar/SSE) | closer to Livewire, less JavaScript shipped | an idiom foreign to TypeScript; DOM diffing to handle | rejected |
| Classic React SPA with a REST API | familiar | state becomes client-authoritative → **loses Filament's essence** | rejected |

## 3. The protocol

Four routes. This is the most stable contract in the product — freeze it early.

```
GET  /panel/api/:resource/schema?operation=create|edit&id=…
     → { schema: SchemaTree, state: State, meta: {…} }

POST /panel/api/:resource/state
     ← { state: State, dirtyPath: string, operation, id? }
     → { state: State, schemaPatch: Patch[], errors: FieldErrors }

GET  /panel/api/:resource/records?page&perPage&sort&search&filters
     → { rows: Row[], total: number, columns: ColumnTree }

POST /panel/api/:resource/actions/:action
     ← { ids?: unknown[], id?: unknown, formState?: State }
     → { result, notifications: Notification[], redirect?: string, refresh?: boolean }
```

### 3.1 The `/state` route — the core

When a `live()` field changes:

1. the client POSTs the complete state plus the changed path;
2. the server runs the resolution cycle (PRD 02 §4);
3. the server returns the canonical state, a **schema patch** (visibility, options, labels, disabled) and the errors.

**The client invents nothing.** It evaluates no condition, computes no option, decides no visibility.

### 3.2 Security — non-negotiable

| Threat | Countermeasure |
|---|---|
| The returned state is forged (a readonly field modified, a hidden field injected) | **The server never trusts incoming state.** It replays it against the schema: any unknown, invisible or `disabled` path is **discarded silently**, not rejected with a message that would inform an attacker. |
| Replay / ID tampering | the `id` is authorized through the Nest guard on every request, never inferred from client state |
| Data leaking through `include` | the loading plan is derived from the server schema, never from client parameters |
| A resolver running user code on client input | resolvers receive the state **after** filtering |
| Resource enumeration | a 404 indistinguishable between "does not exist" and "not authorized" |

Filament has a "Security" page in its documentation — treat this chapter as mandatory, not optional.

### 3.3 Performance budget

| Metric | v0.1 budget | v1.0 budget |
|---|---|---|
| `/state` round trip p95 | 150 ms | 80 ms |
| State payload size (40-field form) | < 30 KB | < 15 KB |
| Debounce on a `live()` text field | 400 ms (configurable) | same |
| Rendering a 10k-row table paginated at 25 | 300 ms | 150 ms |

**Design note taken from Filament**: v4 had to completely rewrite table cell rendering for large datasets, deeply nested components collapsing in v3. → The cell renderer has to be **flat from the start**: no React component per cell carrying context, but a per-column rendering driven by a registry.

## 4. The renderer

### 4.1 Field registry

```ts
registerField('TextInput', TextInputRenderer);
registerField('Select', SelectRenderer);
// a plugin can register its own (PRD 11)
```

An unknown component shows an error placeholder, visible in development and silent in production — never a blank screen.

### 4.2 v0.1 components

Fields: `TextInput`, `Textarea`, `Select`, `Checkbox`, `Toggle`, `Radio`, `DateTimePicker`, `FileUpload`, `Hidden`.
Layout: `Schema`, `Grid`, `Section`.
Table: sortable headers, search, pagination, row selection, bulk action bar.
Chrome: navigation sidebar, breadcrumbs, topbar, modals, slide-overs, toasts.

### 4.3 Front-end stack

| Choice | Decision | Rationale |
|---|---|---|
| Framework | React 19 | what the ecosystem expects, the only reasonable choice |
| Styling | Tailwind v4 | the same choice as Filament; CSS tokens for theming |
| Accessible primitives | Radix | correct a11y for free; we do not rewrite a combobox |
| Build | shipped **precompiled** in the package | the user installs no front-end toolchain — that is the product promise |
| Client state | local only (the field currently being typed in) | the canonical state is on the server |
| Dark mode | v0.1 | expected by default in 2026 |

**Hard constraint**: `@perchjs/ui` is served as static assets by `PanelModule`. An `npm i` then a module import, and the panel exists. **Zero Vite/Webpack configuration asked of the user.**

## 5. Theming

- v0.1: one theme, clean, light + dark.
- v0.2: colors and icons configurable through CSS variables; **CSS hooks** (stable classes on every element, like Filament) for overriding without forking.
- v0.3: complete themes.

## 6. Acceptance criteria

1. **A1** — country → city works, with 0 lines of user JavaScript, in a single round trip.
2. A forged state modifying a `disabled` field has no effect in the database.
3. A forged state injecting an unknown path has no effect and causes no 500 error.
4. A 10,000-row table, 8 columns of which 2 are relations: first render < 300 ms, sort < 200 ms.
5. The panel works after `npm i` plus a module import, with no front-end config file.
6. Full keyboard navigation on forms and tables; AA contrast.
7. An unknown field in the schema does not wipe out the page's rendering.

## 7. Out of scope

- Offline rendering / PWA.
- SSR of the panel (the panel is a client app behind auth).
- Visual schema editor.
- Standalone components outside a panel (Filament offers this; **v2+** for us).
- Real time / websockets (v0.3, with broadcast notifications).

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Round-trip latency perceived as lag | **High** | configurable debounce · optimistic UI on local typing · discreet loading indicator · p95 budget measured in CI |
| State payload too large on big forms | Medium | send only the state, never the schema; incremental patches |
| The renderer becomes a second project to maintain | Medium | component scope closed and versioned with the core |
| A trust flaw in client state | **Critical** | attack tests in CI from v0.1, not after |
