# ADR 0020 — What a soft delete does

**Status:** accepted · **Supersedes:** [0014](0014-soft-delete-in-v01.md) · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma`, `@perchjs/nest`, `@perchjs/ui`)

## Context

ADR 0014 settled what `hasSoftDelete` was allowed to mean while soft delete was unbuilt: it describes the schema and promises nothing about deletion. Its reopening rule was that PRD 05 §4 gets taken up — which is now — and that whatever settles its decision 4 supersedes it.

That list is the work: the read filter, the nested read filter, the unique-index collision, and what a cascade means when the parent is only marked. The specification says almost nothing about any of them. PRD 05 §4 is five table rows, PRD 07 gives a ternary filter and PRD 08 two actions. So the questions are open, and the last two are design rather than implementation.

## What verification established

Every finding ADR 0014 recorded still holds, unchanged:

1. **Nothing filters.** `deletedAt` appears nowhere in `@perchjs/prisma` or in the port. `findMany` and `findOne` add no clause.
2. **`delete()` is unconditional.** It calls `deleteMany` with the keys, on every model, soft-deleting or not.
3. **A relation read carries no filter to add one to.** `includeMap` emits `true` or `{ include: … }` and never a `where`, so filtering the top level would still return deleted children.
4. **A marked row keeps its unique index.** Measured against PostgreSQL 17 for ADR 0014: an `email @unique` set to `ada@example.com` and then given a `deletedAt` still refuses a second insert of the same address. Whoever "deletes" an account can never re-register it.
5. **The column is named in one place.** `SOFT_DELETE_FIELD` is `deletedAt` in `@perchjs/core`, and `hasSoftDelete` is set from it or from generator configuration.

## Options

The one that matters is what happens to `delete()`.

| | What it gives | Kept or not |
|---|---|---|
| **A. `delete()` marks; `forceDelete()` destroys** | The verb a panel offers means what a reader means by it, and destroying is a second, named decision. | **Kept.** ADR 0014 consequence 3 anticipated exactly this change and argued for making it in the port. |
| **B. `delete()` keeps destroying; `softDelete()` marks** | No published method changes meaning. | Not kept. Every caller that wanted the safe thing would have to know to ask for it, and the one who forgets destroys a row. The dangerous operation is the one that should need naming. |
| **C. The panel decides, the adapter destroys** | The port stays simple. | Not kept. Two adapters would answer it twice, and a filter the panel applies is a filter the port's own callers do not get — the same fault as leaving the read filter out. |

## Decision

**1. `delete` marks a soft-deleting model and destroys everything else. Two verbs join it.**

`forceDelete` destroys on every model, and `restore` clears the mark. A model with no `deletedAt` answers all three the same way it answers `delete` today, because there is nothing to mark.

That is a change to a published method's meaning, and it is the change ADR 0014 said v0.2 would make.

**2. Reads leave marked rows out unless they are asked for.**

A query carries which of the three it wants — without deleted, with them, or only them — and the default is without. Named on the query rather than inferred from context: "show me the deleted ones" is a question a reader asks, and a default that changes with the caller is a default nobody can predict.

**3. A relation read is filtered too.**

Finding 3 is the reason this is its own decision rather than a consequence of the second. A page that filters its own rows and loads a relation that does not has filtered nothing that matters — the deleted children arrive inside the parents.

**4. Nothing cascades.**

A mark is on one row. The database's own cascade never fires, because nothing was removed, and marking children instead would be a second write whose extent nobody declared and whose undo nobody wrote. A child of a marked parent stays exactly as it was: readable, editable, and reachable through its own resource.

`forceDelete` is where a cascade happens, because that one is a delete and the database does it.

**5. The unique index is the schema's, and Perch says so rather than working around it.**

A marked row keeps its unique index, so the address it holds can never be used again. The shape that fixes it is a partial unique index — `WHERE "deletedAt" IS NULL` — and that lives in the user's own schema, not in anything Perch generates.

What Perch owes is to not pretend otherwise: the documentation says it, and `forceDelete` is reachable so the row can actually go. A boot-time complaint was considered and refused — a partial index is invisible from the DMMF, so the check would fire on every correctly-built schema.

## Consequences

- **`delete()` changes meaning for every caller of the port**, including a second adapter. That is the trade decision 1 accepts, and the reason it is settled here rather than in one adapter.
- **A panel gains two actions and a filter**: restore, force delete, and the ternary that decides which rows a list shows. Each is authorised separately, because being allowed to hide a row is not being allowed to destroy it.
- **A restore can fail on a unique column**, when the address it holds was taken by somebody else while it was hidden. That is a constraint error to report readably, which PRD 05 §4 already asks for.
- **Every existing read changes**, because the default excludes. A caller that wants what it got before has to say so.

## Reopening rule

A relation whose rows a reader must see the deleted half of *inside* the parent — an audit trail, a history — where filtering the relation hides the very thing the page is for. That is decision 3, and it would reopen with decision 2, since the two describe one behaviour at two depths.

Nothing else. In particular, wanting a cascade back is not a reason: a mark that spreads is a delete that spreads without a delete's warning, and the panel already has a verb for destroying a tree.
