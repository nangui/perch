# Perch

> The lookout over your Nest app.
> Declare it in TypeScript. Watch it appear.

An open-source UI framework for **NestJS**. Define a resource in TypeScript, get a full admin panel, never write a line of front-end. The equivalent of Laravel Filament for the Node ecosystem.

| | |
|---|---|
| Stack | NestJS · Prisma · PostgreSQL · React |
| License | MIT (core) |
| Status | v0.1 complete — its four acceptance criteria pass, six packages building |
| npm scope | `@perchjs/*` — npm organization created |
| Milestones | **A1** dependent select, zero user JavaScript · **A2** relation column, filter, bulk action · **A3** nested repeater in one transaction · **A4** a third-party module extending a form it does not own |
| Decisions | 18 records in [`docs/adr/`](docs/adr/README.md), each with the rule that would reopen it |

## Documentation

```
docs/
├── README.md              recommended reading order
├── adr/                   the structural decisions  ← start here
├── REF-filament.md        the target, taken apart
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
