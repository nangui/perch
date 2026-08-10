---
"@perchjs/cli": minor
"@perchjs/prisma-generator": minor
"@perchjs/core": minor
---

Add `perch doctor`, and fingerprint the schema from the file.

`perch doctor` reads a project and reports what is missing: Prisma absent or a
major Perch has not been checked against, no schema, no Perch generator block,
no generated IR, an IR generated from a different schema, no `PanelModule.forRoot`,
and two resources answering at one URL. Warnings do not fail the exit code, so
it can run in CI.

The generator now writes `perch.meta.json` beside the IR, holding a fingerprint
of the schema **as it sits on disk**. Not `options.datamodel` — Prisma hands
generators its own formatted rendering, so `id Int` arrives as `id    Int`, and
comparing that to the file a user edits reports a stale IR on a project where
nothing is wrong. Both file and directory schema layouts are read.

`defaultSlug` moves to `@perchjs/core`, so the decorator's default and doctor's
collision check derive a URL by one rule rather than two.
