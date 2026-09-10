# Architecture Decision Records

Perch's structural decisions, with their context, the options set aside and **the rule that would reopen the debate**.

## Why this folder exists

An unwritten decision is a decision that will be relitigated. Each of the records below was argued several times before being settled — without a trace, they would still be.

An ADR is not a living document. **It is never edited**, only replaced by a later ADR that supersedes it. That is what lets you read back why a decision was made, and not only what was decided.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-nestjs-ecosystem.md) | NestJS rather than Go or Rust | accepted |
| [0002](0002-prisma-orm.md) | Prisma rather than Drizzle | accepted |
| [0003](0003-state-protocol.md) | Server-authoritative state, JSON transport + React | accepted |
| [0004](0004-naming.md) | Perch — and the naming principle | accepted |
| [0005](0005-npm-scope.md) | npm scope `@perchjs` rather than `@perch` | accepted |
| [0006](0006-target-market-reading.md) | Reading "target market" in the name's reopening rule | accepted |
| [0007](0007-panel-asset-delivery.md) | `@perchjs/nest` depends on `@perchjs/ui` to serve its assets | accepted |
| [0008](0008-versioning-policy.md) | Lockstep versioning across the five packages | accepted |
| [0009](0009-panel-bundle.md) | The panel is served as a second, self-contained bundle | accepted |
| [0010](0010-state-response-shape.md) | `/state` answers with the whole tree, not a schema patch | accepted |
| [0011](0011-admission-in-waves.md) | Client state is admitted in waves, not in one pass | accepted |
| [0012](0012-ir-at-build-time.md) | The IR is produced at build time, by a Prisma generator | accepted |
| [0013](0013-what-read-only-names.md) | `isReadOnly` names the database owning a value, not a relation | accepted |
| [0014](0014-soft-delete-in-v01.md) | `hasSoftDelete` describes the schema; deletion stays hard until v0.2 | superseded by [0020](0020-what-a-soft-delete-does.md) |
| [0015](0015-cli-command-names-and-layout.md) | The command is `perch panel`, and the CLI writes under `src/admin/` | accepted |
| [0016](0016-file-storage-port.md) | Uploads go up on selection, through a storage port, and the row is written last | accepted |
| [0017](0017-what-an-action-receives.md) | An action's callback takes one record; a bulk trigger runs it per record in one transaction | accepted |
| [0018](0018-how-a-repeater-addresses-its-rows.md) | A repeater's rows are flat paths under a stable key, and its own path holds their order | accepted |
| [0019](0019-what-an-infolist-resolves-against.md) | An entry reads the record by a path and never enters the state map, so an infolist admits nothing | accepted |
| [0020](0020-what-a-soft-delete-does.md) | `delete` marks and `forceDelete` destroys; reads exclude marked rows at every depth, and nothing cascades | accepted |
| [0021](0021-what-scopes-a-relation-manager.md) | A manager is scoped by a column derived from the IR and reached through its parent's address, never from a body | accepted |
| [0022](0022-what-a-layout-says-about-what-it-holds.md) | A layout's `visible` and `disabled` apply to everything under it, folded in one pass after resolution | accepted |
| [0023](0023-what-the-panel-is-allowed-to-serve.md) | The asset manifest names every chunk the bundle is made of, and stays the allowlist it was | accepted |
| [0024](0024-what-a-base-class-may-grow.md) | `Component` may grow, and each new method on it is a breaking change for plugins | accepted |
| [0025](0025-what-a-header-may-offer.md) | A header action must be a `CreateAction`; anything else stops the boot until recordless actions exist | accepted |
| [0026](0026-how-a-filter-is-named.md) | A filter is made from the class it is, and named at construction; PRD 07 is corrected to match | accepted |
| [0027](0027-what-an-icon-is.md) | An icon is a name the panel draws, refused at boot if unknown; a plugin's own mark is not one | proposed |

## Format

```
Context           the problem, in a few lines
Options           what was compared, against which criteria
Decision          what is kept
Consequences      what it locks in, what it costs
Reopening rule    what — and only what — would reopen the debate
```

The last heading is the most important one. Without it an ADR protects nothing: a returning urge is enough for everything to start over.
