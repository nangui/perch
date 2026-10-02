# Perch

> The lookout over your Nest app.
> Declare it in TypeScript. Watch it appear.

An open-source UI framework for **NestJS**. Define a resource in TypeScript, get a full admin panel, never write a line of front-end. The equivalent of Laravel Filament for the Node ecosystem.

| | |
|---|---|
| Stack | NestJS · Prisma · PostgreSQL · React |
| License | MIT (core) |
| Status | v0.2 published · v0.3 in progress — seven packages released together |
| npm scope | `@perchjs/*` — published, every package at one version |
| Milestones | **A1** dependent select, zero user JavaScript · **A2** relation column, filter, bulk action · **A3** nested repeater in one transaction · **A4** a third-party module extending a form it does not own |
| Decisions | 35 records in [`docs/adr/`](docs/adr/README.md), each with the rule that would reopen it |

## Where it is

**v0.1 and v0.2 are closed and published.** All seven packages are on npm,
carrying one version number and released together — through npm's trusted
publishing rather than a token. The four acceptance milestones pass, each held by
a test that names it: A1 on the state protocol and A2 on the query layer, both
inside the p95 the build enforces, A3 on a repeater written in one transaction,
A4 on a module extending a form it does not own.

**What is in it.** It draws eighteen field types, eleven table columns, layouts,
prime content, infolists, relation managers, actions and bulk actions, a filter
bar with ranges and a filter carrying a schema of its own, uploads with a staging
lifecycle, soft delete, a custom-field escape hatch, and inline editing from the
table — a write that goes through the form's own schema, boundary and policies
rather than around them.

**v0.3 is in progress, and three of its changes are breaking.** A resource
offering `ViewAction` as a link has to declare an `infolist()`; an entry with no
label of its own now takes the path it reads; and the panel asks for a NestJS
platform whose multipart parser honours the limits the upload route sets, an
older one having ignored them in silence.

**One thing is left from the tooling tier: where the demo runs.** Its code and
its Dockerfile are written, under [`examples/demo`](examples/demo) — four
resources over a bird-sightings schema, seeded at boot and put back on the hour
unless told otherwise. Where it is deployed is not a decision this tree can
take.

Everything the framework can draw is drawn somewhere in
[`examples/basic`](examples/basic), which is the honest way to see it: run it and
click.

## Documentation

```
docs/
├── README.md              recommended reading order
├── adr/                   the structural decisions  ← start here
├── REF-filament.md        the target, taken apart
├── BRIEF-design.md        what the panel should look like, and why
├── 00-PRD-MASTER.md       vision, roadmap, name and trademark
├── 01 … 11-PRD-*.md       the eleven PRDs
└── 12-ARCH-backend.md · 13-ARCH-frontend.md
```

**Entry point:** [`docs/00-PRD-MASTER.md`](docs/00-PRD-MASTER.md) — **full reading order:** [`docs/README.md`](docs/README.md)

## The name

**Perch.** A bird's perch: the vantage point over your data.

The name is a closed decision, recorded in [ADR 0004](docs/adr/0004-naming.md).

## Contributing

The documentation is settled and the code has started, so both are open: a contradiction spotted in a document, a case left uncovered by a test. [`CONTRIBUTING.md`](CONTRIBUTING.md) sets out how, and what is not up for discussion.

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). Use of the name and logo is governed by [`TRADEMARK.md`](TRADEMARK.md).
