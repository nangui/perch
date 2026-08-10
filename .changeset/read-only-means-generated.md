---
"@perchjs/prisma-generator": minor
---

`isReadOnly` names a value produced at write time, not the column a relation owns.

It was read straight from Prisma's field of that name, which means something
else: `true` on a foreign key, `false` on an autoincrement `id` — the reverse of
the example the IR documents it by. It is now derived from `@updatedAt` and from
a generated default (`now()`, `autoincrement()`, `uuid()`, `cuid()`,
`dbgenerated()`), while a literal default stays editable — `@default(true)` is a
value somebody can pick, whoever ends up evaluating it. See ADR 0013.

A column with a generated default that is not the primary key — `createdAt`
above all — leaves the form. Foreign keys are unaffected: `inferModel` already
excluded them through the relation that owns them.
