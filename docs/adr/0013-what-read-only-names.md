# ADR 0013 — What `isReadOnly` names

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma-generator`)

## Context

`FieldMeta.isReadOnly` is documented, in `ir.ts` and in PRD 01 §2, as one thing: *`@default(autoincrement())`, `@updatedAt` — the database owns this value*. PRD 01 §3.2 then spends it: `isReadOnly` or `isId` means *excluded from the form, visible in the table and the infolist*.

The DMMF reader fills it from Prisma's field of the same name. Prisma means something else by it: **a relation owns this column**. It is `true` on a foreign key and `false` on an `id @default(autoincrement())` — the exact reverse of the example the documentation gives. ADR 0012 recorded the divergence when the contract test first surfaced it, and deliberately left it open.

The line as written is `field.isReadOnly || field.isUpdatedAt === true`, which is two concepts joined by an `||`: Prisma's, plus a correction for `@updatedAt` that Prisma does not flag at all.

## What verification established

Points 1 to 4 come from running `inferModel` over the twelve-model fixture; the default shapes in the decision come from a generator run over a schema written to carry one of each. Neither was reasoned about.

1. **Prisma's meaning does no work in the only path that runs today.** `inferModel` removes foreign keys before `inferField` is ever called — `const foreignKeys = new Set(model.relations.flatMap((r) => [...r.foreignKeyFields]))` — so `Post.authorId` and `Post.categoryId` carry `isReadOnly: true` and never reach the code that reads it. Adopting Prisma's meaning wholesale would document a flag that changes nothing.

2. **One field is excluded by it, across two models: `updatedAt`.** And it is excluded by the `|| isUpdatedAt` correction, not by Prisma's value, which is `false`.

3. **The documented meaning is half-implemented.** A column the database generates but that is not the primary key — `@default(autoincrement())` on a non-id, `@default(now())` on `createdAt` — comes back `isReadOnly: false` and lands in the form. `User.createdAt` is in the form today.

4. **`deletedAt` is in the form too.** It is not read-only under either meaning, so this record does not settle it; it is named because the same measurement produced it and because offering an editable tombstone on a soft-deleting model deletes the row from a form field.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Adopt Prisma's meaning, document it** | one comment changed, nothing else | rejected: measurement 1. It would rename the flag after a concept that no consumer consults, and leave 3 unfixed |
| **B. Derive the documented meaning** | `isReadOnly` becomes what both documents already say it is | **kept** |
| **C. Two flags — generated, and relation-owned** | each concept named | rejected: `RelationMeta.foreignKeyFields` already carries the second, and `inferModel` already spends it. A second flag would be a third place to keep in step |
| **D. Leave it, document the divergence** | nothing to build | rejected: 3 is a defect rather than a curiosity, and a flag whose name means the opposite of its value in the documentation's own example will be misread by the next person to consume it |

## Decision

**`isReadOnly` means what it has always said: the database owns this value. It stops being read from Prisma's field of that name.**

1. **It is derived**, from `isUpdatedAt` and from a default the database evaluates. The two are already distinguishable and it was checked rather than assumed: `autoincrement()`, `now()`, `uuid()`, `cuid()` and `dbgenerated("…")` all arrive as `{ name, args }`, while `@default(true)`, `@default(0)` and `@default("draft")` arrive as the literal. `@updatedAt` carries no default at all, only its own flag.

2. **Prisma's `isReadOnly` is no longer consulted.** Not renamed, not kept alongside — dropped. The information it carries is `RelationMeta.foreignKeyFields`, which is where `inferModel` already reads it.

3. **A default the user could reasonably set stays editable.** `isActive Boolean @default(true)` is a literal: the database supplies it when the form does not, which is not the same as owning it.

4. **The contract test pins the divergence rather than the agreement.** It asserts that a foreign key comes back editable and that a generated column comes back read-only — the two places where the IR now deliberately disagrees with the DMMF field it used to copy.

## Consequences

1. **`createdAt` leaves the form.** That is the intended fix and it is a behaviour change: a panel that let an operator backdate a row will stop. `@default(now())` says the database owns the value; a schema that wants it editable removes the default.

2. **Foreign keys become editable in `inferField`, and stay excluded in `inferModel`.** `inferModel` is the only caller of `inferField` in the repository today, and it never hands it a foreign key. A caller who does gets a `TextInput` for `authorId` — which is what asking about a column in isolation means, and why `inferModel` exists.

3. **The reader keeps one fewer input from the DMMF.** `DmmfField.isReadOnly` becomes unused. It stays declared, because the structural type is a record of what the shape contains rather than of what we happen to read.

4. **PRD 01 §2's comment becomes true rather than aspirational.** Its examples — `@default(autoincrement())`, `@updatedAt` — both hold after this, and neither did before.

5. **Two existing tests change, and one of them would rot quietly.** `dmmf-reader.test.ts` currently pins Prisma's reading outright — `authorId` read-only, `id` not — which is the assertion this record inverts; it becomes a pin on the disagreement instead. The subtler one is `inference.test.ts`'s "keeps time when the name says nothing about it", which reads `createdAt.dateOnly` and expects `undefined`. After this, `createdAt` returns early as read-only and never reaches the date inference, so the test keeps passing while testing nothing. It needs a field that is still in the form.

6. **`deletedAt` is still in the form.** This record does not fix it, and says so, so that nobody reads it as covered.

## Reopening rule

**One:** a consumer appears that needs to distinguish *the database owns this* from *a relation owns this* at the field level, without the model in hand. `foreignKeyFields` is only reachable through the model; if something legitimately cannot reach it, option C stops being a third place to keep in step and becomes the only way to answer.

Does not reopen this: Prisma renaming or redefining its own `isReadOnly`. We no longer read it.
