# Perch

> The lookout over your Nest app.
> Declare it in TypeScript. Watch it appear.

An open-source UI framework for **NestJS**. Define a resource in TypeScript, get a full admin panel, never write a line of front-end. The equivalent of Laravel Filament for the Node ecosystem.

| | |
|---|---|
| Stack | NestJS · Prisma · PostgreSQL · React |
| License | MIT (core) |
| Status | pre-implementation — 14 documents frozen |
| npm scope | `@perchjs/*` — npm organization created |
| Critical path | milestone **A1**: reactive dependent select, zero user JavaScript |
| Decisions | ADR [0001](docs/adr/0001-ecosysteme-nestjs.md) · [0002](docs/adr/0002-orm-prisma.md) · [0003](docs/adr/0003-protocole-etat.md) · [0004](docs/adr/0004-nommage.md) · [0005](docs/adr/0005-scope-npm.md) · [0006](docs/adr/0006-lecture-marche-cible.md) · [0007](docs/adr/0007-panel-asset-delivery.md) · [0008](docs/adr/0008-versioning-policy.md) |

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

The name is a closed decision, recorded in [ADR 0004](docs/adr/0004-nommage.md).

## Contributing

The project is pre-implementation: the most useful contribution today is to the documentation — a contradiction spotted, a case left uncovered. [`CONTRIBUTING.md`](CONTRIBUTING.md) sets out how, and what is not up for discussion.

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). Use of the name and logo is governed by [`TRADEMARK.md`](TRADEMARK.md).
