# Perch

> The lookout over your Nest app.
> Declare it in TypeScript. Watch it appear.

An open-source UI framework for **NestJS**. Define a resource in TypeScript, get a full admin panel, never write a line of front-end. The equivalent of Laravel Filament for the Node ecosystem.

| | |
|---|---|
| Stack | NestJS · Prisma · PostgreSQL · React |
| License | MIT (core) |
| Status | v0.1 complete · v0.2 in progress — six packages building |
| npm scope | `@perchjs/*` — organization reserved, nothing published yet |
| Milestones | **A1** dependent select, zero user JavaScript · **A2** relation column, filter, bulk action · **A3** nested repeater in one transaction · **A4** a third-party module extending a form it does not own |
| Decisions | 23 records in [`docs/adr/`](docs/adr/README.md), each with the rule that would reopen it |

## Where it is

**v0.1 is complete.** A1, A3 and A4 each have a test that carries the milestone's
name and passes; A2's parts — relation columns, filters, bulk actions — are
covered piece by piece rather than by one test standing for the whole. The
latency budget on `/state` is enforced by the build, not by intention.

**v0.2 is under way.** Seventeen field types, eight table columns, layouts, prime
content, relation managers, uploads with a staging lifecycle, soft delete, a
custom-field escape hatch, and inline editing from the table — a write that goes
through the form's own schema, boundary and policies rather than around them.
Still to come in the tier: a markdown editor, two range filters, and a filter
that carries a schema of its own.

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
