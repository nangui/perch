# ARCH 13 — Frontend architecture (`@perchjs/ui`)

**Status:** architecture decision · **Completes:** PRD 03, 06, 07

## 1. Founding principle

> **The client is an interpreter, not an application.**

Three responsibilities, no others: render a tree, capture input, apply a patch. No business logic, no condition evaluation, no option computation, no visibility decision.

Every time there is a temptation to put a rule on the client "just for reactivity", the essence of the product is lost. The answer is always: the server, with a debounce.

## 2. Module graph

```
shell/         routing, layout, sidebar, topbar, auth boundary
kernel/        SchemaRenderer · ComponentRegistry · StateStore
               TransportClient · PatchApplier
components/    fields/ · layouts/ · columns/ · entries/     ← dumb leaves
table/         flat renderer, column registry
overlays/      modals, slide-overs, toasts
theme/         CSS variables, tokens, dark mode
```

**Dependency rule:** `components/` never imports the inside of `kernel/` and never calls the transport. A component receives props and an `onChange`. That is exactly what makes it replaceable by a plugin — a component that knows about the transport is not substitutable.

## 3. State ownership — the 3-zone model

This is the most structural decision on the frontend.

| Zone | Owner | Examples | Survives a patch? |
|---|---|---|---|
| **Canonical** | **the server** | values, visibility, options, `disabled`, errors | replaced |
| **Draft** | the client, ephemeral | characters typed before the debounce flushes | protected (§4) |
| **Pure UI** | the client alone | collapsed section, active tab, scroll, column width, visual sort | untouched |

**Rule:** any state that influences persistence or validation is canonical. Canonical state is **never** duplicated into client state — it is read. In case of conflict, **the server wins**.

Practical corollary: there is no global state-management library. A minimal store for the canonical zone, local `useState` for the pure-UI zone. Introducing Redux/Zustand here is an invitation to duplicate canonical state.

## 4. The reconciliation problem

**This is the bug that makes a Livewire clone "feel broken", and nobody plans for it.**

Scenario: the user types in field B while a patch triggered by field A comes back from the server. Naively, the patch overwrites B → keystrokes lost, cursor jumping.

The solution, in three mechanisms:

1. **Revisions and dirty paths.** The store keeps a `Set<path>` of paths modified locally and not yet confirmed. A patch **never overwrites** a dirty path.
2. **Authoritative exception.** The server can mark a path `authoritative: true` (a computed value, a total for instance). That one overwrites, dirty or not — and the renderer signals the change visually.
3. **Single-flight queue per form.** One `/state` request in flight at a time. Changes occurring during the flight are **merged** into the next request, never stacked. Every request carries a sequence number; an out-of-sequence response is thrown away.

To be designed now, not when the bugs arrive.

## 5. TransportClient

| Aspect | Decision |
|---|---|
| Concurrency | single-flight + coalescing per form |
| Debounce | by field type: text 400 ms, select/toggle/date 0 ms |
| Ordering | sequence number, stale responses ignored |
| Network failure | a banner + manual retry, **never** a silent loss |
| 422 error | errors applied per path, focus moved to the first invalid field |
| 500 error | a banner with a copyable `requestId` |
| Optimism | on the draft zone only; never on visibility or options |

That last point matters: optimistically showing a field that may appear produces flicker. We prefer 150 ms of latency to a flash.

## 6. Rendering

**SchemaRenderer** walks the tree and memoizes per node, keyed on `(component.key, revision)`. A node whose revision has not changed is not re-rendered.

**Table: flat rendering.** A constraint inherited from PRD 07 §2 — Filament v4 had to rewrite its cell rendering because nested components collapsed at volume. Concretely for us: one render function memoized **per column type**, and cells that are simple outputs, not React components with hooks and context. Non-negotiable from the first commit.

**Error boundaries** at every top-level layout node. A broken component degrades its section, never the page. An unknown component type shows a marker, visible in development and discreet in production.

## 7. Component registry and plugins

```ts
registerField('TextInput', TextInputRenderer);
registerColumn('Text', TextColumnRenderer);
registerEntry('Text', TextEntryRenderer);
```

**Two ways to load a plugin's component:**

| Option | Cost | Verdict |
|---|---|---|
| (a) the plugin publishes React source, the user recompiles | requires a front-end toolchain on the user's side → **kills the "zero configuration" promise** | rejected |
| (b) the plugin ships a precompiled bundle (ESM), served by its own assets endpoint, loaded at runtime | a props contract to version | **kept** |

A renderer's props contract is therefore a **versioned public API**, documented as such.

## 8. Asset delivery

`@perchjs/ui` is published **precompiled**. `PanelModule` serves it statically. The user configures neither Vite, nor Webpack, nor Tailwind. That is the product promise, not a convenience.

- One main bundle + lazy chunks for the heavy fields: `RichEditor` (TipTap), `CodeEditor`, `Charts`.
- Hashed filenames, immutable cache.
- **Budget: main bundle < 250 KB gzip.** Measured in CI, blocking.

## 9. Theming

CSS variables only — no theming in JavaScript. Three levels:

1. semantic tokens (`--perch-color-primary`, `--perch-radius-md`, `--perch-space-2`)
2. **CSS hooks**: a stable class on every structural element (as in Filament), to override without forking
3. dark mode by an attribute on the root, not by duplicating rules

## 10. Accessibility — treated as a requirement, not a correction

| Requirement | Means |
|---|---|
| Accessible primitives | Radix (combobox, dialog, tabs, dropdown) — we do not rewrite a combobox |
| Focus | trapped in modals, restored on close, visible everywhere |
| Table | full keyboard navigation, sortable headers actionable from the keyboard |
| Notifications | a polite live region |
| Contrast | AA minimum, verified in CI |
| Form errors | bound to the field by `aria-describedby`, announced |

## 11. What this architecture deliberately forbids

- No global state management (it invites duplication of canonical state).
- No conditional logic on the client (it loses the essence of the product).
- No table cell component with hooks (the performance wall).
- No front-end toolchain on the user's side (it loses the installation promise).
- No optimistic rendering of structure (flicker).
