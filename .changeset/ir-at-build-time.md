---
"@perchjs/prisma-generator": minor
"@perchjs/prisma": minor
---

The IR is produced at build time by a Prisma generator.

Prisma 7 strips the runtime DMMF to names and types, so `Prisma.dmmf` no longer
carries the metadata the IR is made of. `@perchjs/prisma-generator` receives the
full DMMF during `prisma generate` and writes the IR as a TypeScript file;
`PrismaDataAdapter` now takes `{ client, ir }` and no longer reads a DMMF.
