# CLAUDE.md — Perch

Standing context for any agent working on this repository. Read it in full before acting,
every session.

## What this project is

**Perch** — an open-source UI framework for NestJS. You declare a resource in TypeScript and
get a complete admin panel; you never write any front end. It is the equivalent of Laravel
Filament for the Node ecosystem.

Status: **in implementation**. The documentation is complete and settled.
`packages/prisma-generator` turns the Prisma schema into the intermediate representation while
`prisma generate` runs (ADR 0012), `packages/prisma` executes queries from it, `packages/core`
carries the component tree, the resolution cycle, the trust boundary and the transport format,
and `packages/ui` renders that tree. The four acceptance milestones pass, each held by a test
that names it: A1 on `/state` within a 150 ms p95 across 100 round trips, A2 on the query layer
within the same budget, A3 on a repeater written in one transaction, A4 on a module extending a
form it does not own.

## Read before acting

Start no task without having read the documents it touches. They have authority over this file.

| You are about to… | Read first |
|---|---|
| anything | `docs/adr/` — the structural decisions |
| understand the target | `docs/REF-filament.md` |
| touch the backend | `docs/12-ARCH-backend.md` |
| touch the frontend | `docs/13-ARCH-frontend.md` |
| write the metadata layer | `docs/01-PRD-metadata-layer.md` |
| write the schema engine | `docs/02-PRD-schema-engine.md` |
| write the protocol or the renderer | `docs/03-PRD-protocol-renderer.md` |
| add a field, a column, an action | the matching PRD (06, 07, 08) |

`docs/README.md` gives the full reading order.

## Invariants — never break these

These eight rules are broken by default unless you hold them in mind. Each is justified in the
documentation; do not relitigate them, apply them.

1. **State is authoritative on the server.** The client is an interpreter, not an application:
   no business logic, no condition evaluation, no option computation on the client. If you are
   tempted to bend this "just for responsiveness", the answer is: the server, with a debounce.
2. **`@perchjs/core` imports neither `@nestjs/*`, nor `@prisma/client`, nor `react`.** Dependency
   arrows only ever point inward. A `dependency-cruiser` test must guarantee it.
3. **Builders are immutable.** Every fluent method returns a clone. A mutable builder shared
   between requests leaks one user's state into another's — that is a security hole, not a
   matter of style.
4. **Every piece of client state is replayed against the schema tree** (stage 5 of the pipeline).
   Unknown path, invisible field, `disabled` or `readOnly` → discarded **silently**, never with
   a message that would inform an attacker.
5. **An invisible field is never validated nor persisted.** The same holds for
   `.dehydrated(false)`.
6. **Table cell rendering is flat.** No React component per cell with hooks and context: one
   memoised render function per *column type*. Filament had to rewrite its whole table rendering
   for this reason — we do not repeat its mistake.
7. **No N+1 queries.** Every relation column produces an `include`. The SQL query counter is a
   blocking test, not an intention.
8. **Authorization is checked on the server at execution time**, never only when the button is
   rendered. A hidden button is not a protection.

## Where we are, and where to start

**The four acceptance milestones pass.** Each is held by a test that names it, so what they
validate is measured rather than remembered:

| | Validates | Held by |
|---|---|---|
| A1 | the state protocol | `core/src/resolve.test.ts`, `ui/src/fields/fields.test.tsx`, and the p95 in `nest/src/panel-state.latency.test.ts` |
| A2 | the query layer | `nest/src/milestone-a2.http.test.ts` |
| A3 | the schema tree and persistence | `nest/src/panel-save.repeater.http.test.ts` |
| A4 | extensibility | `nest/src/schema-hook.http.test.ts` |

The gate these were written for is cleared. The protocol held at A1, and nothing built since has
asked for it to be redesigned.

**v0.1 is closed and published.** Its thirty rows in `docs/00-PRD-MASTER.md` §6 are all built,
and six packages are on npm at `0.1.2`. The release job opens the version pull request; merging
it publishes, through npm's trusted publishing rather than a token.

**`@perchjs/testing` is the seventh package, and it is not published.** It is built and it is in
the `fixed` version group (ADR 0008), so the next release will try to publish it; npm answers
404 for that name today. A trusted publisher has to be configured for it, or the release
publishes six packages and fails on the seventh. That is the one step nobody in this tree can
take.

**v0.2 is in progress.** Render hooks, the user menu, custom pages, custom resource pages and
`@perchjs/testing` are built, and the guide is thirty-six pages whose every TypeScript block is
compiled against what the packages publish. What is left is the rest of the documentation named
in PRD 10 §4.2 — a page per column and per action, `llms.txt`, the auth recipes, a deployed demo
— and `discoverResources`, which PRD 04 assigns to v0.2 and which the scope table in PRD 00 does
not carry. A changeset for `0.2.0` is pending.

**Two suites need a database, and skip without one.** `tooling/database.test.ts` and
`tooling/panel-database.test.ts` skip what touches PostgreSQL unless `DATABASE_URL` is set,
which is what CI gives them. The count is deliberately not written here: it changes with
almost every commit, and a number nobody maintains is worse than none. A suite that fails
to load reports its tests as skipped rather than as failed, so a skip here is worth opening
rather than reading past.

## Package layout

| Package | Responsibility | May import |
|---|---|---|
| `@perchjs/core` | schema engine, state resolution, validation | nothing |
| `@perchjs/prisma-generator` | DMMF → IR, at build time | core |
| `@perchjs/prisma` | query execution, from that IR | core |
| `@perchjs/nest` | `PanelModule`, routing, guards, navigation | core |
| `@perchjs/ui` | React renderer, component registry | core (types only) |
| `@perchjs/cli` | code generation | core |
| `@perchjs/testing` | driving a panel the way a browser does | core, nest |

## Stack

NestJS · Prisma · PostgreSQL · React 19 · Tailwind v4 · Radix · strict TypeScript.

PRD 02 and ARCH 12 name Zod as the validation engine, and nothing in the tree depends on it:
validation was built without it. Do not assume it is there, and do not settle the difference on
your own initiative — say so and let me decide which of the two is wrong.

Prisma only, PostgreSQL only, Express only in v0.1. The `DataAdapter` interface exists to make
other adapters possible later — **do not implement one now, and never cross the boundary.**

## CI guardrails — from the first commit

These are not tasks for later. They exist before the code they protect.

- dependency test: `core` stays pure
- SQL query counter per page (anti N+1)
- p95 latency budget on `/state` and `/records`
- concurrency test: 100 parallel requests, no shared state
- attack tests: forged state, unknown path, unauthorised action
- DMMF contract test

More have been added since, and they read the source rather than the behaviour: that no comment
cites a document by number, that every example in the documentation compiles against what the
packages publish, that no declared style token goes unread, that every count written in prose
matches the tree, that no TypeScript file sits outside every project. Most live in `tooling/`.

## How we work

**You run no git command.** Not `init`, not `add`, not `commit`, not `push`, not `gh`. You give
me the commands in copyable blocks as you go, and I run them myself. You may create, modify and
delete files freely.

**One step at a time.** You stop after each step, show what you did, give the matching commit,
and wait for my confirmation.

**Commits:** Conventional Commits, in English, imperative, subject ≤ 72 characters.
Types: `feat` `fix` `docs` `chore` `refactor` `test` `build` `ci`.
Scopes: `core` `prisma` `prisma-generator` `nest` `ui` `cli` `testing` `docs` `repo`.
One commit = one logical change. The body explains the *why*, not the *how*.

**Hand a commit over as a file, never as `-m`.** Write the message to the session scratchpad —
subject on line 1, blank line, body — and give me `git add` one path per line, then
`git commit -F <path>`.

Not a preference: I run these in interactive zsh, where a `!` inside double quotes is history
expansion and the command dies with `event not found`. A body quoting the characters `!`, `*`
and `+` did exactly that. Backticks are the same class of problem — they need escaping inside
double quotes or the shell runs them as command substitution, and a message that mentions
`ICON_NAMES` mentions it in backticks. A message file has no shell quoting at all, so the prose
can say anything. One `git add` per line so a failure names the path it choked on.

**Everything in English** — documentation, code, comments, symbol names, commit messages. The
repository is the publication: an ADR answers "why is it like this", and that answer is useless
to a contributor who cannot read it. Drafting in French and publishing in English remains
perfectly legitimate.

**The migration is complete.** No file in this repository is in French any more, this one
included. Keep it that way.

## Vocabulary

| Term | Precise meaning in this project |
|---|---|
| **Resource** | a class describing the CRUD of a Prisma model |
| **Schema** | the declarative component tree (forms, infolists, layouts) |
| **Field** | a component carrying state and subject to validation |
| **Resolver** | a function evaluated **on the server** producing a dynamic value |
| **IR** | the intermediate representation, generated from the DMMF at build time |
| **WriteTree** | the write tree, nested writes included |
| **Stage 5** | the trust boundary of the backend pipeline |
| **A1…A4** | the four acceptance milestones |

## What not to do

- Relitigate a decision recorded in an ADR. Each carries its **reopening rule** — if it is not
  met, the matter is closed. The project name in particular is not up for discussion.
- Modify an existing ADR. A decision that changes gives rise to a **new** ADR superseding the
  old one.
- Reword, summarise or "improve" a document in `docs/`. Tell me what looks wrong to you; do not
  fix it on your own initiative.
- Add a dependency without telling me explicitly and telling me why.
- Build a feature listed as "out of scope" in a PRD. Out of scope constrains as tightly as
  scope: it is what stops the drift towards a CMS.
- Ship a "half-finished" field. Ten complete fields beat twenty approximate ones.
