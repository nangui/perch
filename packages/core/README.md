# @perchjs/core

The domain layer: the component tree, the resolution cycle, the trust boundary and the
transport format. It imports nothing — not NestJS, not Prisma, not React — and a
`dependency-cruiser` test keeps it that way.

Part of [Perch](https://github.com/nangui/perch) — an admin panel for NestJS that you declare
in TypeScript and never write a front end for. The seven `@perchjs/*` packages share one version
number and are released together.

You do not install this on its own. It arrives with `@perchjs/nest`, and it is what a
resource is written against.

## Documentation

The decisions behind this package, and the reasoning for each, are in the repository:
`docs/` for the architecture and the product, `docs/adr/` for the structural choices.

## Licence

MIT
