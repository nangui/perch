# ADR 0012 — The IR is produced at build time, by a Prisma generator

**Status:** proposed · **Scope:** Perch (`@perchjs/prisma`, and a new `@perchjs/prisma-generator`)

## Context

PRD 01 builds the whole metadata layer on one sentence: read `Prisma.dmmf` from the generated client, turn it into the IR. `dmmf-reader.ts` is written against that, is the only file allowed to know the DMMF's shape, and carries a contract test so a Prisma upgrade fails loudly instead of producing a subtly wrong IR.

The contract test never ran against a real DMMF. It asserts that malformed input is refused; it had nothing genuine to compare with, because the fixture is hand-written on purpose — generating one would have needed a client, a database and a migration, which would have made the fastest tests in the repo the slowest.

Pointing it at a real Prisma 7 client, for the first time, produces this on the first model:

```
DmmfContractError: Field User.role is an enum of type "Role", which is absent
from datamodel.enums.
```

## What verification established

All measured against Prisma 7.9.1 as installed, not recalled.

1. **The runtime DMMF has been stripped.** `Prisma.dmmf.datamodel.models[].fields[]` now carries `name`, `kind`, `type`, and `relationName` on a relation. Nothing else. Gone: `isRequired`, `isId`, `isUnique`, `isList`, `isReadOnly`, `hasDefaultValue`, `default`, `nativeType`, `documentation`, `isUpdatedAt`. `datamodel.enums` is `[]`. A model carries `name`, `fields`, `dbName` — no `primaryKey`, no `uniqueFields`, no `documentation`.

   That is not a subset the reader can be taught to cope with. It is every input the IR is made of.

2. **`dmmf-reader.ts` is not wrong.** Handed the full DMMF it reads correctly, in exactly the shape it declares. What broke is its source, not its logic.

3. **The full DMMF still exists, in two places.** `@prisma/internals.getDMMF()` returns it from the schema text. A Prisma **generator**, through `@prisma/generator-helper`, receives it as `options.dmmf`. Both were run against the twelve-model fixture schema; both returned 12 models, 3 enums, and fields carrying `nativeType: ["VarChar", ["255"]]`, `documentation`, `isReadOnly`, and per-model `primaryKey` / `uniqueFields`. The two agree field for field.

4. **The package already said so, and nobody was listening.** `SUPPORTED_PRISMA_RANGE` reads `">=5.0.0 <7.0.0"`. The peer dependency reads `"^7.0.0"`. The published package would demand Prisma 7 at install and announce at runtime that it does not support it. The constant is never compared against the installed version — it only ever appears inside an error message, so the contradiction was unobservable.

5. **Prisma 7 also removed `url` from `datasource`.** A connection now needs `prisma.config.ts` plus a driver adapter passed to the client. This is unrelated to the IR, but it is the other reason nothing about this could have been noticed without actually running the current Prisma.

6. **The hand-written fixture had drifted, in both directions.** Thirty-six fields, all of them `isReadOnly`. Prisma flags a foreign key read-only and leaves an autoincrement `id` alone; the fixture said the opposite of both. Precisely the risk its own header names as accepted — and it also surfaces that Prisma's `isReadOnly` means "a relation owns this column", where PRD 01 §2 documents it as "the database generates this value". The two agree on what a form should do and disagree on why, which is worth its own decision and is not taken here.

7. **The whole user path was walked, not assumed.** Both packages were packed, installed into a scratch project from their tarballs, and driven the way a reader of the documentation would drive them: one `generator` block naming `perch-prisma-generator`, no `output`, `softDelete = ["Note"]`, then `prisma generate`. The binary resolved, `defaultOutput` put the file at `./perch/ir.ts`, `@db.VarChar(120)` arrived as `maxLength: 120`, and a model with no `deletedAt` came back `hasSoftDelete: true`. The emitted file then typechecked against `Ir` under `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, which is the only place that annotation can be exercised.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. `@prisma/internals.getDMMF()` at bootstrap** | one line changed; the reader and its whole contract test survive untouched | rejected: `@prisma/internals` is internal by name and by policy, carries no SemVer promise, and ships the schema wasm engine. It would become a **runtime** dependency of every Perch application, to compute at every boot something that cannot change between boots |
| **B. A Prisma generator, IR emitted at build time** | the full DMMF, from the interface Prisma designed for exactly this, at the only moment the schema can change | **kept** |
| **C. Stay on Prisma 6** | nothing to build | rejected: it contradicts the peer range already published, and postpones a break that gets larger. Prisma removed this deliberately; it is not coming back |
| **D. Parse `schema.prisma` ourselves** | no Prisma build-time dependency at all | rejected: it replaces a dependency on Prisma's DMMF with a dependency on Prisma's grammar. Strictly more surface, for the same class of risk |

## Decision

**The IR is generated, not read. `@perchjs/prisma-generator` receives the DMMF at `prisma generate` and writes the IR as a TypeScript file. `@perchjs/prisma` takes that IR and no longer knows what a DMMF is.**

1. **A new package, `@perchjs/prisma-generator`,** declaring the binary `perch-prisma-generator`. A user adds one block to their schema and runs the generator they already run.

2. **`dmmf-reader.ts` moves into it**, with its fixture and its tests. This is the part that is more than a file move: `@perchjs/prisma` is the runtime adapter, and once the IR arrives ready-made, a runtime adapter that still knew the DMMF's shape would be carrying a build-time concern for no reason. PRD 01 §4's requirement — that DMMF knowledge live in exactly one file, isolated, with a contract test — is unchanged. Only which package that file sits in changes.

3. **`@perchjs/prisma` keeps exactly one dependency, `@perchjs/core`, and one peer, `@prisma/client`.** Putting the generator inside it would have added `@prisma/generator-helper` — a CLI-side package — to the runtime tree of every application. Putting it in `@perchjs/cli` would have made one adapter import another, which `no-adapter-to-adapter` forbids and a blocking test enforces. The generator is not an adapter: it sits outside the hexagon and depends only inward, on `@perchjs/core`.

4. **`PrismaDataAdapterOptions` becomes `{ client, ir }`.** The `dmmf` and `readOptions` fields go. `ReadOptions.softDelete` becomes generator configuration, declared in the schema block where the models it names are already visible.

5. **The generator emits a `.ts` file**, annotated `const IR: Ir`, so a generator that emits something malformed fails the consumer's own typecheck rather than at the first query. The type is re-exported from `@perchjs/prisma`, which the consumer installs directly — a generated file must not import a package the user never declared.

6. **The contract test finally has something to compare against.** It runs `prisma generate` over a twelve-model fixture schema, with the built generator as the provider, and checks the IR that comes out against the one the hand-written DMMF produces. `prisma` is a **dev** dependency of the generator package alone. It needs no database, so it runs inside plain `pnpm test` — and because it drives the real binary, it also covers the RPC handshake, the manifest and the output path, none of which a unit test reaches.

7. **`SUPPORTED_PRISMA_RANGE` becomes true**, and the contract test is what holds it there. It cannot be enforced at runtime — a generator is handed an engine hash, not a version — so what makes it more than a string in an error message is that widening it now requires the test to pass against the wider version.

## Consequences

1. **A sixth published package.** Lockstep versioning (ADR 0008) already covers it by glob, so the cost is one manifest and one CI target, not a new release process. The alternative was to make one of two true statements false: either the adapter's dependency claim, or the adapter-to-adapter boundary.

2. **A build step appears between the schema and a working panel.** A user who edits `schema.prisma` and forgets `prisma generate` gets a stale IR. This is not new — Prisma's own client has always had it — and it is strictly better than the alternative it replaces: a stale IR is a compile error at the generated file, where reading the DMMF at boot would have been a runtime surprise.

3. **The IR becomes a reviewable artefact.** It is checked in, so a diff shows when `labelField` moves — and `labelField` is what search reaches, which makes it security-relevant rather than cosmetic.

4. **PRD 01 §4 no longer describes what happens.** It names `Prisma.dmmf` as the source and `packages/prisma` as the home of the reader. Both change here. This record does not edit it; reconciling the specification is its own task, as it was for ADR 0010 and 0011.

5. **A Prisma major upgrade now breaks the generator, loudly, at build.** That is the outcome PRD 01 §4 asked for and did not get: this whole record exists because the failure was silent for one whole major version.

6. **What still needs a real database is smaller than it looked.** Proving Prisma *accepts* the adapter's translated arguments still does, as do the SQL query counter and the p95 budget. The DMMF contract does not, any more.

## Reopening rule

**One:** Prisma restores the full datamodel to the generated client at runtime, under a documented, SemVer-covered API. Reading it at boot would then be simpler than generating it, and options A and B are worth weighing again.

Does not reopen this: the inconvenience of running `prisma generate`. That step already exists for the client, and a user who has not run it has no client either.
