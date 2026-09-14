# @perchjs/prisma-generator

A Prisma generator. It runs during `prisma generate` and writes the intermediate
representation the rest of Perch reads.

Part of [Perch](https://github.com/nangui/perch) — an admin panel for NestJS that you declare
in TypeScript and never write a front end for. The six `@perchjs/*` packages share one version
number and are released together.

Prisma 7 strips the runtime DMMF to names and types, so the metadata a panel needs is
captured at build time rather than read at boot.

## Documentation

The decisions behind this package, and the reasoning for each, are in the repository:
`docs/` for the architecture and the product, `docs/adr/` for the structural choices.

## Licence

MIT
