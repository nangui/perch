# ADR 0017 — What an action receives, and how a bulk trigger composes it

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/ui`)

## Context

`Action` exists in `core` and carries a label. Nothing else. `CreateAction` and `EditAction` are links to pages that already exist, and the file says why the rest is absent: *an action that renders and does nothing would be worse than one that is absent.*

Everything else in PRD 08 is still to build — a callback, authorization, confirmation, a modal, notifications — and the first acceptance criterion constrains all of it at once:

> An action with confirmation + a modal form + a success notification works as a row action, a bulk action and a header action, **with the same code**.

That is not a request for three features that resemble one another. It forbids a `BulkAction` class. So the shape of the callback has to be settled before any of the five pieces is written, because every one of them is downstream of it.

Two things are genuinely open. **What the callback receives** — one record, or the set. And **what crosses the wire when a reader ticks rows** — the identifiers, or a description of the selection.

## What verification established

1. **The PRD's own example takes one record.** `.action(async (record, data) => …)`, in §2, in the passage that says the contract is identical everywhere. A callback taking a collection would make the row trigger the special case.
2. **Criterion 4 asks for a transaction and a count**, not for a single query: *a bulk action over 500 rows runs in one transaction and reports the number of items processed.* Running one callback per record inside one transaction satisfies it literally.
3. **`DataAdapter.transaction` already exists** and is what `commitUploads` and the save routes go through. A bulk trigger needs no new capability from the data layer.
4. **Authorization is per record.** `.authorize((user, record) => …)` takes a record, and invariant 8 requires it checked at execution time. Fifty ticked rows are fifty questions, not one.
5. **A predicate is not the same request.** Sending the filter means the server acts on what matches *now*, which is not necessarily what was on screen when the reader ticked. That gap is real and has to be answered — it is not a variation on sending identifiers.

## Options

### What the callback receives

| | What it gives | Kept or not |
|---|---|---|
| **A. One record** | The row trigger and the bulk trigger call the same function. Authorization, visibility and the callback all take the same argument. | **Kept.** It is what the PRD writes, and it is what makes criterion 1 true rather than approximately true. |
| **B. The set** | An action that can act on 500 rows in one statement. | Not kept for v0.1. It makes the common case — one row — a list of one, and it moves the transaction into the callback, where every author has to remember it. Reachable later as an opt-in for the actions that want it, without changing A. |

### What crosses when rows are ticked

| | What it gives | Kept or not |
|---|---|---|
| **C. The identifiers** | The server acts on exactly the rows the reader saw and ticked. Bounded, and every one of them is authorized by name. | **Kept.** |
| **D. The current filter** | "Select all 40,000 matching" without enumerating them. | Not kept for v0.1. It acts on what matches at execution time rather than on what was ticked, so a row added between the two is deleted by an action nobody aimed at it. That deserves its own record and its own confirmation wording, not a flag on this one. |

## Decision

**1. One `Action` class, and the callback receives one record.** `(record, data) => Notification | void`. There is no `BulkAction`, and there will not be one.

**2. A bulk trigger runs that callback once per ticked record, inside one transaction, and reports how many it processed.** The transaction is the framework's, not the author's: an action written for a row is correct as a bulk action without its author having thought about bulk at all. That is the whole content of criterion 1.

This governs the callback an author writes. A ready-made action is the framework's own code and may implement the set directly where the data layer already offers it — `DeleteAction` over fifty rows is one `delete(model, ids)`, not fifty. It is held to the same answer, not to the same number of queries.

**3. The selection crosses as identifiers.** The client sends what it ticked. "Select all" ticks the page that is displayed, and says so.

**4. Authorization is asked per record, at execution time, and a refusal stops that record rather than the batch.** The answer reports what was processed and what was refused, without saying why — invariant 8, and the same silence the trust boundary keeps.

**5. The callback never crosses the wire.** What the client is told is the label, whether a confirmation is needed and what it says. A function is not serialisable and an action's body is not the client's business.

## Consequences

- A `BulkAction` class cannot be added later without contradicting this record. That is the intent.
- Every action author writes single-record code and gets bulk for nothing. The cost is that an action which *could* be one statement over 500 rows runs as 500, inside a transaction. For v0.1 that is an acceptable trade against 500 rows; it is not acceptable at 500,000, which is the reopening rule below. The ready-made actions do not pay it, which is also why the exception in decision 2 is written there rather than discovered by reading their source.
- A bulk request is bounded by how many identifiers fit in a body. That ceiling is real and has to be stated to the reader rather than discovered — a selection larger than the route accepts is refused, not silently truncated.
- Partial success is a possible answer. An action refused on three of fifty records processed forty-seven, and the notification says so. Reporting only "done" would be a lie the reader could not check.

## Reopening rule

**One:** an action has to act on a set larger than a request body can name, or larger than a per-record loop can finish inside one transaction. Then option D stops being a convenience and becomes the only shape, and a new record supersedes decision 3 — with the gap in verification 5 answered explicitly, not waved at.

**Two:** a real action is found that cannot be expressed one record at a time. Then decision 1 gains an opt-in for the set, and this record says which actions may use it.

Does not reopen this: that per-record is slower than a single statement. It is, and the trade was made against criterion 1, which is worth more than the difference at the sizes v0.1 accepts.
