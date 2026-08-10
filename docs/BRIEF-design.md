# Design brief — Perch

A working document for an agent or a designer. It has no authority over the ADRs
or the PRDs: where it contradicts them, they win.

---

## The prompt, to be handed over as is

> You are designing the design system of an open-source framework for admin
> interfaces. Read this brief in full before producing anything, and start by
> asking me the questions that remain open rather than filling the gaps with
> default choices.
>
> ### The product
>
> **Perch** — the equivalent of Laravel Filament for NestJS. A developer
> describes a resource in TypeScript on the server and gets a complete admin
> panel without writing a line of front-end code. The rendering is React, but
> **the framework's user never touches React**: they configure neither Vite, nor
> Webpack, nor Tailwind. The panel is served precompiled.
>
> Tagline: *"The lookout over your Nest app. Declare it in TypeScript. Watch it
> appear."*
>
> ### Who looks at these screens
>
> Two audiences, and they do not want the same thing:
>
> 1. **The developer installing Perch.** They judge in thirty seconds, from a
>    screenshot, whether the result looks professional or cobbled together. They
>    are the one who adopts.
> 2. **The employee using the panel eight hours a day** — data entry, sorting,
>    filters, bulk actions. Density, legibility and keyboard speed matter more to
>    them than elegance.
>
> When the two conflict, **the second wins**. A back office is a tool for work,
> not a shop window.
>
> ### No existing design system is attached — deliberately
>
> **The tokens are the deliverable, not the starting point.** Attach no
> pre-existing design system, and do not derive your visual direction from one.
>
> Three reasons, in this order:
>
> 1. **Perch is a framework whose design system will be re-themed by its users**
>    (ARCH 13 §9). It therefore has to be cast for that. Laying it on somebody
>    else's preset is painting over a foundation that was never meant to carry
>    this weight.
> 2. **The available presets are editorial systems** — Swiss grid, parchment
>    background, newspaper layout. They are made for pages that tell something. A
>    dense back office, keyboard-navigable and AA-checked in CI, has the opposite
>    constraints.
> 3. **An attached preset becomes the constraint**, and there are no longer three
>    positions to choose between.
>
> The type aimed at: **an application system, dense, token-first.** Semantic only
> — never `blue-500` in a screen. Light and dark at parity from the first token.
> Radix primitives dressed by our own styling layer. Reference class: Linear,
> Supabase Studio, Directus, Filament — not an editorial starter.
>
> ### Non-negotiable constraints
>
> They come from architecture decisions already taken. Do not relitigate them;
> design with them.
>
> - **State is authoritative on the server.** The interface is an interpreter:
>   zero business logic on the client. The direct consequence for you: a field can
>   appear, disappear, become disabled or see its options change **in response to
>   a network round trip**. So the intermediate states have to be designed: a
>   dependent field loading, a section appearing, a list of options being
>   refreshed. A form that jumps visually on every patch is a design failure, not
>   a technical detail.
> - **Three state zones, to be treated differently on screen.** *Canonical*: the
>   server's truth, replaced on every response. *Draft*: what the user types
>   before the debounce, to be protected visually — we never overwrite their
>   keystrokes. *Pure UI*: collapsed section, active tab, column width, to be
>   preserved across updates.
> - **The debounce is 400 ms on text, 0 ms on select, toggle and date.** The
>   visual feedback has to make that difference understandable without explaining
>   it.
> - **Radix for every interactive primitive** — combobox, dialog, tabs, dropdown.
>   We do not rewrite an accessible combobox. Design with what Radix can do.
> - **Accessibility: a requirement, not a fix.** AA contrast minimum, checked in
>   continuous integration. Focus visible everywhere, trapped in modals, restored
>   on close. Table fully keyboard-navigable, sortable headers actionable from the
>   keyboard. Errors tied to their field, and announced.
> - **Flat table rendering.** No React component per cell: one memoised render
>   function per column *type*. A design that requires per-cell state is not
>   buildable here.
> - **Themable through tokens.** An integrator must be able to rebrand the panel
>   without forking the CSS.
>
> ### What I am asking you to produce
>
> **1. A visual direction, as three distinct proposals.** Not three variations on
> one idea: three positions that can be chosen between. For each, one sentence on
> what it gives up.
>
> **2. The tokens.** Semantic colours (`surface`, `content`, `border`, `accent`,
> `danger`, `warning`, `success` — never `blue-500` in a screen), type scale,
> spacing scale, radii, shadows, animation durations. Light and dark from the
> start, not added afterwards.
>
> **3. The form components**, in their full set of states — rest, hover, focus,
> disabled, read-only, in error, loading, empty: `TextInput` (with its text,
> email, password, URL and numeric variants), `Textarea`, `Toggle`, `Select`
> (including a dependent select mid-refresh, and a relation select with search),
> `DateTimePicker` (date only and date-time), `CodeEditor`, and the repeatable
> group ("repeater") with add, remove and reorder.
>
> **4. The table.** Sortable header, row, selected row, multiple selection with a
> bulk action bar, filters, pagination, empty state, loading state, relation
> column, truncated column. Plan for density: someone processing 200 rows a day
> does not want generous padding.
>
> **5. The surfaces.** Modal, side panel, notification (success, error, warning),
> network error banner with a copyable request identifier, destructive action
> confirmation.
>
> **6. The panel structure** — the part I am most waiting for, and the one
> usually rushed: side navigation with groups and count badges, breadcrumbs, page
> header with its actions, form layout (one column, two columns, sections, tabs),
> list page, detail page ("infolist"), dashboard with widgets. How all of it
> behaves at 1280 px wide, then at 768.
>
> **7. The error and empty states**, treated as screens in their own right rather
> than as accidents.
>
> ### What I do not want
>
> - Yet another copy of the default shadcn/ui aesthetic. If the visual direction
>   is indistinguishable from a generic Next.js starter, it has failed.
> - Purple gradients, "glassmorphism", floating cards everywhere.
> - A design that only holds on a wide screen, or that assumes a mouse.
> - Mockups showing only the happy path. The error, loading and empty states are
>   half the work.
> - Density sacrificed to elegance. See audience number 2.
>
> ### The useful comparison
>
> Look at **Filament** (PHP/Laravel): it is the functional target and the quality
> bar. Look also at **Retool**, **Directus**, **Strapi**, **Supabase Studio** and
> **Linear** for density and keyboard use. Tell me what each one gets right and
> what it gets wrong — I would rather have a reasoned opinion than a consensus.
>
> ### How to deliver
>
> Start with the visual direction and the tokens, show them to me, wait for my
> approval. Do not produce the fifty components before we agree on the
> foundations. And if a constraint above makes a design choice impossible, say so
> instead of working around it.

---

## Notes for myself, outside the prompt

**Decision of 6 August 2026 — no design system attached.** The design tool
offered five presets (Modernist, Nocturne, Organic, Broadsheet, Industry); none
was kept. The reason that counts is not aesthetic: Perch's design system *is* a
deliverable of the product, meant to be re-themed by its users, and a framework
does not build its foundation on somebody else's preset. On top of that, those
presets are editorial systems, where the target is a dense application system.

This note exists to avoid reopening the subject. What would reopen it: a preset
genuinely designed for dense tooling — in which case it becomes a *candidate* to
be evaluated like the other directions, never a constraint imposed in advance.

**What remains to be settled before the design is of any use:** nothing blocks
the design work; it can start now and in parallel with the backend. That is even
the most efficient order: milestone A1 will need three finished components, and
having them drawn in advance avoids improvising them.

**The three components on the critical path**, to be asked for first if time is
short: `Select` (with its "options being refreshed" state), `TextInput`, and the
one-column form layout. That is exactly what A1 puts to the test — a "city"
select whose options depend on a "country" select.

**Sources in this repository**, if the agent wants to check a constraint:
`docs/13-ARCH-frontend.md` (state zones, transport, accessibility, theming),
`docs/03-PRD-protocol-renderer.md` (state protocol), `docs/06-PRD-forms-fields.md`
(field catalogue), `docs/07-PRD-tables.md` (table builder),
`docs/08-PRD-actions-notifications.md` (modals and notifications),
`docs/09-PRD-infolists-widgets.md` (detail page and dashboard).
