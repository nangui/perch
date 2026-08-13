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
| [0014](0014-soft-delete-in-v01.md) | `hasSoftDelete` describes the schema; deletion stays hard until v0.2 | accepted |
| [0015](0015-cli-command-names-and-layout.md) | The command is `perch panel`, and the CLI writes under `src/admin/` | accepted |
| [0016](0016-file-storage-port.md) | Uploads go up on selection, through a storage port, and the row is written last | accepted |

## Format

```
Context           the problem, in a few lines
Options           what was compared, against which criteria
Decision          what is kept
Consequences      what it locks in, what it costs
Reopening rule    what — and only what — would reopen the debate
```

The last heading is the most important one. Without it an ADR protects nothing: a returning urge is enough for everything to start over.
