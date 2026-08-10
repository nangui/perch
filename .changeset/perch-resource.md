---
"@perchjs/cli": minor
"@perchjs/prisma-generator": minor
---

`perch resource <Model>` generates a resource.

A standalone command, writing `src/admin/resources/<model>.resource.ts` from the
IR the Prisma generator already produced — not from the DMMF, so the CLI and the
panel cannot disagree about what a column means. Every line comes from
`inferModel`, and a field the form does not offer is written as a comment
carrying its reason.

It refuses to overwrite without `--force`, per PRD 10 §5.3.

The generator now writes `ir.json` beside `ir.ts`. The module is TypeScript and
the CLI is a plain Node binary; parsing the literal back out of the source would
be string surgery on a file that already exists.
