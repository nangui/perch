# Documentation

## Decisions (ADR) — read these first

The structural decisions, with their context, the options set aside and **the rule that would reopen the debate**. An unwritten decision is a decision that will be relitigated.

| # | Decision |
|---|---|
| [0001](adr/0001-nestjs-ecosystem.md) | NestJS rather than Go or Rust |
| [0002](adr/0002-prisma-orm.md) | Prisma rather than Drizzle |
| [0003](adr/0003-state-protocol.md) | Server-authoritative state, JSON transport + React |
| [0004](adr/0004-naming.md) | Perch — and the naming principle |
| [0005](adr/0005-npm-scope.md) | npm scope `@perchjs` rather than `@perch` |
| [0006](adr/0006-target-market-reading.md) | Reading "target market" in the name's reopening rule |
| [0007](adr/0007-panel-asset-delivery.md) | `@perchjs/nest` depends on `@perchjs/ui` to serve its assets |
| [0008](adr/0008-versioning-policy.md) | Lockstep versioning across the five packages |
| [0009](adr/0009-panel-bundle.md) | The panel is served as a second, self-contained bundle |
| [0010](adr/0010-state-response-shape.md) | `/state` answers with the whole tree, not a schema patch |
| [0011](adr/0011-admission-in-waves.md) | Client state is admitted in waves, not in one pass |
| [0012](adr/0012-ir-at-build-time.md) | The IR is produced at build time, by a Prisma generator |
| [0013](adr/0013-what-read-only-names.md) | `isReadOnly` names the database owning a value, not a relation |
| [0014](adr/0014-soft-delete-in-v01.md) | `hasSoftDelete` describes the schema; deletion stays hard until v0.2 |
| [0015](adr/0015-cli-command-names-and-layout.md) | The command is `perch panel`, and the CLI writes under `src/admin/` |
| [0016](adr/0016-file-storage-port.md) | Uploads go up on selection, through a storage port, and the row is written last |
| [0017](adr/0017-what-an-action-receives.md) | An action's callback takes one record; a bulk trigger runs it per record in one transaction |
| [0018](adr/0018-how-a-repeater-addresses-its-rows.md) | A repeater's rows are flat paths under a stable key, and its own path holds their order |
| [0019](adr/0019-what-an-infolist-resolves-against.md) | An entry resolves against the record, and its value never enters the state map |
| [0020](adr/0020-what-a-soft-delete-does.md) | `delete` marks a soft-deleting model, `forceDelete` destroys, and reads leave marked rows out |
| [0021](adr/0021-what-scopes-a-relation-manager.md) | A relation manager is scoped from the address, by a foreign key derived from the IR at boot |
| [0022](adr/0022-what-a-layout-says-about-what-it-holds.md) | A layout's flags apply to everything it holds, in one pass after resolution |
| [0023](adr/0023-what-the-panel-is-allowed-to-serve.md) | The asset manifest names the bundle's chunks as well as its entries, and stays the allowlist |
| [0024](adr/0024-what-a-base-class-may-grow.md) | `Component` may grow, and every method added to it is a breaking change plugins are told about |
| [0025](adr/0025-what-a-header-may-offer.md) | A header action must be a `CreateAction`, refused at boot rather than narrowed in the type |
| [0026](adr/0026-how-a-filter-is-named.md) | A filter is made from its own class, and its name is given at construction |
| [0027](adr/0027-what-an-icon-is.md) | An icon is a name from a small shipped set, and an unknown one stops the boot |
| [0028](adr/0028-where-a-drawing-lives.md) | A named mark and one the panel fits to its own slot live apart, and share no path data |
| [0029](adr/0029-what-a-decision-may-name.md) | A decision names what a file holds; where it lives belongs to the guard that enforces it |
| [0030](adr/0030-how-a-closed-vocabulary-arrives.md) | A word leaving a closed vocabulary is refused at once; the set grows additively |
| [0031](adr/0031-what-validates-a-value.md) | The engine is the one that exists, and a schema from another library is taken where a rule is |
| [0032](adr/0032-what-an-aggregate-asks-for.md) | One aggregate call carries several named functions over the rows a narrowing keeps |
| [0033](adr/0033-what-a-group-is.md) | A group answers a key and a size, asked only about the keys the page holds |
| [0034](adr/0034-the-budget-moved-after-all.md) | A page's cost is written as a shape rather than as a number |
| [0035](adr/0035-what-a-row-may-hold.md) | A row leaves the adapter with no bigint in it, which is what took the page down |
| [0036](adr/0036-when-a-widget-gets-its-numbers.md) | A widget's numbers arrive on their own request, after the shell has drawn |

## Perch — a UI framework for NestJS

Recommended reading order: **ADR → REF → 00 → 12 → 13 → 01 → 02 → 03**, then the rest according to the batch in progress.

| Doc | Title | Tier | Role |
|---|---|---|---|
| [00](00-PRD-MASTER.md) | **Master** | — | vision, Filament inventory, roadmap, name and trademark |
| [01](01-PRD-metadata-layer.md) | Metadata layer (Prisma → IR, at build time) | v0.1 | the first batch to build |
| [02](02-PRD-schema-engine.md) | Schema engine | v0.1 | the core |
| [03](03-PRD-protocol-renderer.md) | State protocol & renderer | v0.1 | replaces Livewire |
| [04](04-PRD-panel-nest.md) | Nest PanelModule | v0.1 | routing, auth, navigation |
| [05](05-PRD-resources.md) | Resources & CRUD pages | v0.1 | |
| [06](06-PRD-forms-fields.md) | Forms — field catalog | v0.1→v0.3 | |
| [07](07-PRD-tables.md) | Table builder | v0.1→v0.3 | |
| [08](08-PRD-actions-notifications.md) | Actions, modals, notifications | v0.1 | |
| [09](09-PRD-infolists-widgets.md) | Infolists, widgets, dashboard | v0.2→v0.3 | |
| [10](10-PRD-cli-testing-docs.md) | CLI, testing, documentation | v0.1→v0.2 | |
| [11](11-PRD-plugins-ecosystem.md) | Extensibility & plugins | v0.1 (contract) | the real competitive moat |
| [12](12-ARCH-backend.md) | **Backend architecture** | — | layers, 9-stage pipeline, caches |
| [13](13-ARCH-frontend.md) | **Frontend architecture** | — | 3 state zones, reconciliation |
| [REF](REF-filament.md) | *Filament taken apart* | — | the target, its 6 preconditions, the landscape |

### The 4 blocking milestones

| # | Case | Validates | If it fails |
|---|---|---|---|
| **A1** | Dependent select, country → city, zero JavaScript | the state protocol | **stop and redesign the protocol** |
| **A2** | Table: relation column + filter + bulk + modal | the query layer | revisit the QueryPlanner |
| **A3** | Nested Repeater in a transaction | the schema tree | revisit the WriteTree |
| **A4** | Third-party module injecting a field | extensibility | no ecosystem is possible |

---

## Conventions

- Every PRD carries: objective · specification · **acceptance criteria** · out of scope · risks.
- "Out of scope" is as binding as in scope. It is what stops the drift toward a CMS.
- A quantified performance budget is a requirement tested in CI, not an intention.

`BRIEF-design.md` is a working note rather than specification: it carries a prompt meant for a design tool.
