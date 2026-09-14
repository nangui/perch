# @perchjs/prisma

The Prisma adapter: it runs the queries a panel asks for, from the intermediate
representation the generator wrote. PostgreSQL only in v0.1.

Part of [Perch](https://github.com/nangui/perch) — an admin panel for NestJS that you declare
in TypeScript and never write a front end for. The six `@perchjs/*` packages share one version
number and are released together.

Relations named by a column become one `include` rather than one query per row, which a
query counter holds as a blocking test.

## Documentation

The decisions behind this package, and the reasoning for each, are in the repository:
`docs/` for the architecture and the product, `docs/adr/` for the structural choices.

## Licence

MIT
