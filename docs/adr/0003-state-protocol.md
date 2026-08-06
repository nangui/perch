# ADR 0003 — Server-authoritative state, JSON transport + React

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/ui`) · **The most structural decision in the product**

## Context

Filament describes Livewire as *"server-driven reactivity for building dynamic interfaces without writing an API"*, and states that **every page of a panel is a Livewire component**. That is the behavior to obtain in TypeScript, where no canonical equivalent exists.

Two things Livewire conflates have to be separated:

- **the essence** — state lives on the server, which decides everything conditional;
- **the transport** — diffed HTML sent over HTTP.

## Options

| Option | Benefit | Cost | Verdict |
|---|---|---|---|
| React renderer driven by a JSON schema | type-safe end to end, React ecosystem, debuggable | a renderer has to be written | **kept** |
| Server-driven HTML (HTMX / Datastar over SSE) | closer to Livewire, less JavaScript shipped | an idiom foreign to TypeScript; DOM diffing to handle yourself | rejected |
| Classic React SPA over a REST API | familiar, quick to start | state becomes **client-authoritative** → loses the essence of the product | rejected |

## Decision

**Keep Livewire's essence, take Payload's transport.**

State is authoritative on the server; the transport is JSON to a React renderer. We do not reimplement DOM diffing.

Four routes, the most stable contract in the product:

```
GET  /panel/api/:resource/schema     → tree + initial state
POST /panel/api/:resource/state      → { state, schemaPatch, errors }
GET  /panel/api/:resource/records    → rows + pagination
POST /panel/api/:resource/actions/:a → result + notifications
```

## Consequences

**What it locks in**

- The client is an **interpreter, not an application**: no business logic, no condition evaluation, no option computation on the client. Every time there is a temptation to bend that "just for reactivity", the answer is: the server, with a debounce.
- The trust boundary is **a named stage of the pipeline** (stage 5, ARCH 12), not a precaution scattered around. All incoming state is replayed against the tree; an unknown, invisible or `disabled` path is discarded **silently**.
- Two problems become mandatory to handle at design time rather than at bug time:
  - the resolvers' **dependency graph**, or the whole tree is re-evaluated on every keystroke;
  - **reconciliation** (ARCH 13 §4) — a patch coming back while the user is typing elsewhere overwrites their keystrokes. That is *the* bug that makes a Livewire clone "feel broken".

**What it costs**

Perceived round-trip latency. Explicit budget: p95 under 150 ms in v0.1, under 80 ms in v1.0. Mitigated by a per-field-type debounce and optimism confined to the draft zone — **never** on visibility or options, on pain of flicker.

## Reopening rule

- Milestone **A1** shows unacceptable perceived latency despite debounce and local optimism → re-examine the transport, **not** the essence.
- A Livewire equivalent emerges and takes hold in TypeScript → re-evaluate the transport only.

**The essence — server-authoritative state — is not reopenable.** Abandoning it would produce yet another headless React admin, which is to say exactly the product whose existence is not justified.
