# ADR 0014 — What `hasSoftDelete` means before v0.2

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma`)

## Context

`ModelMeta.hasSoftDelete` has been in the IR since PRD 01, filled by the `deletedAt` convention or by generator configuration. Until ADR 0013's follow-up it was read by nothing at all. It now excludes the tombstone column from an inferred form, and that made a question visible that had never had to be answered: the adapter does not honour it. Reads return deleted rows and `delete()` issues `deleteMany`, which is a hard delete.

That reads like a defect and is not one. The specification is unambiguous and consistent about where this belongs:

| | |
|---|---|
| PRD MASTER §6 | *Deleting + soft deletes + restore / force delete* — **v0.2**, PRD 05 |
| PRD MASTER §8 | v0.2 is the release that carries *soft deletes* |
| PRD 05 §4 | *Deletion & soft deletes* **(v0.2)** |
| PRD 07 §5 | `TernaryFilter` *with / without deleted* — **v0.2** |
| PRD 08 §4 | `RestoreAction` / `ForceDeleteAction` — **v0.2** |

Out of scope constrains as tightly as scope. The question this record settles is therefore not *how* soft delete works, which is PRD 05 §4's, but **what the flag is allowed to mean in the meantime** — because a flag that says `true` while `delete()` destroys the row is a claim the code does not honour, and somebody will build on it.

## What verification established

1. **Nothing filters.** `findMany` and `findOne` add no `deletedAt` clause; the adapter has no notion of one.
2. **`delete()` is unconditional.** It calls `deleteMany` with the keys, on every model, soft-deleting or not.
3. **An include would leak regardless.** `includeMap` emits `true` or `{ include: … }` and never a `where`, so a nested read carries no filter to add one to. Fixing reads at the top level would still return deleted children.
4. **No deletion is reachable from a v0.1 panel.** No controller exposes one, and `dehydrate` produces a flat record with no `relations`, so not even a nested delete can be built from a form. `delete()` and `WriteTree.relations.*.delete` are reachable only by code written directly against the port. Whatever this record settles, it settles for that audience and for v0.2, not for a user clicking a button today.
5. **A soft-deleted row keeps its unique index.** Measured against PostgreSQL 17: a row with `email @unique` set to `ada@example.com`, then given a `deletedAt`, still refuses a second insert of the same address — `duplicate key value violates unique constraint`. Whoever "deletes" an account can never re-register it. This is not a detail of the eventual implementation; it is the reason a partial one is worse than none.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Implement it in the adapter now** | the flag becomes honest immediately | rejected: it is v0.2 in five documents, and shipping the filter without the ternary filter, restore and force delete of PRD 05, 07 and 08 leaves rows a user can neither see nor recover. Point 5 makes the half-version actively harmful |
| **B. Make `delete()` refuse on a soft-deleting model** | loud rather than silent | rejected: point 4 — nothing in the panel calls it, so the only caller it would break is somebody using the port deliberately, and breaking a published method to warn about an unbuilt feature is the wrong trade |
| **C. Say what the flag means, and pin it** | the claim matches the code, and v0.2 starts from a measured list | **kept** |
| **D. Drop the flag until v0.2** | nothing to misread | rejected: it is what excludes the tombstone from a form, and PRD 01 §3 names it |

## Decision

**`hasSoftDelete` describes the schema, not the behaviour. Nothing in v0.1 may read it as a promise about deletion.**

1. **The port is to say so.** `DataAdapter.delete` gains a comment making it unconditional in v0.1: it destroys the rows, on every model. An adapter that soft-deleted instead would be answering a different question than the one the port asks, and no caller could tell which it got.

2. **The IR's comment on `hasSoftDelete` is to say the same.** It records that the model carries a deletion column; it does not say the framework uses it.

3. **The current behaviour gets a test.** Nothing calls `delete()` outside the adapter's own tests today, so nothing would notice if it changed — which is why the pin is worth more here than where a feature is in daily use. A test asserting today's hard delete is not an endorsement of it; it is what makes the change to soft delete legible in a diff.

4. **The findings above become v0.2's starting list**, rather than being rediscovered: the read filter, the nested read filter, the unique-index collision, and what a cascade means when the parent is only marked. The last two are design questions rather than implementation ones — Postgres offers partial unique indexes, and a cascade cannot follow a row that was never removed.

## Consequences

1. **Nobody loses a row over this in v0.1**, because nothing in the panel deletes. What is being corrected is not a live hazard but an ambiguous contract: `@perchjs/prisma` is published, `delete()` is public, and its meaning was legible only by noticing that no filter was there. That is a poor way to learn what a method does.

2. **The tombstone stays out of the form anyway.** Excluding a column that would delete the row costs nothing and is right under either release, which is why it did not wait for this record.

3. **v0.2 changes the meaning of `delete()`.** Every caller of the port is affected, and a second adapter would have to answer the same question. That is an argument for settling it in the port rather than in one adapter, and for doing it once rather than per model.

4. **The unique-index collision may reach the schema.** If v0.2 filters on `deletedAt`, a partial unique index is the shape that keeps `email` reusable — and that is a migration in the user's schema, not a change in Perch. It belongs in PRD 05 §4's design, and it is why this record does not start it early.

## Reopening rule

**One:** PRD 05 §4 is taken up, which is v0.2 by definition. Then the flag gains its behaviour and this record is superseded by whatever settles the list in decision 4.

Does not reopen this: finding the hard delete surprising. It is written down, and the alternative is a partial soft delete that loses rows behind a filter nothing can lift.
