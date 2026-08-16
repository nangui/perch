# ADR 0018 — How a repeater addresses its rows

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/prisma`, `@perchjs/ui`)

## Context

Milestone A3 is the repeater: *adding, editing, reordering and deleting rows in a single transaction, with a complete rollback on failure.* PRD 06 calls it the project's hard case, and the hard part is not the transaction — `DataAdapter.transaction` has existed since the beginning and `WriteTree.relations` was declared for exactly this. The hard part is that a repeater is the first thing in the panel whose **shape is not known when the form is declared**.

Everything built so far assumes a fixed set of fields. The trust boundary iterates `path → value` against a map built from the tree. The resolution cycle resolves each node once. The client holds a draft keyed by path, and a round trip names one `dirtyPath`. Sorting, filtering, options, actions: every one of them is an allowlist read off a declaration.

A repeater has as many fields as it has rows, and the reader decides how many. So the question is not "how do we store a list" but "what does a path mean when the thing it names did not exist when the form was written".

## What verification established

1. **The boundary is flat.** `sanitize.ts` walks `Object.entries(incoming)` and looks each path up in a map. It has no notion of descending into anything, and it is the one file in the repository that must not become interesting.
2. **The dirty path names a field.** The state protocol sends one `dirtyPath` per round trip, and the client's draft is a `Map<path, value>`. Both stop meaning anything if a path can name a collection.
3. **`WriteTree.relations` is already shaped for this** — `create`, `update`, `delete`, `connect`, `disconnect` — and has never been produced by anything.
4. **A row needs an identity that survives a reorder.** Two rows swapping is the ordinary case, and a value in flight when it happens must not land on the other row.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Flat paths, stable row key** — `items.r1.label` | The boundary, the cycle, the dirty path and the client's draft all keep working unchanged. A reorder moves no path. | **Kept.** |
| **B. Flat paths, row index** — `items.0.label` | Readable, and the order is implied rather than held. | Not kept. A reorder rewrites every path below it, so a round trip in flight during a swap writes onto the neighbouring row — and deleting the first row shifts every path after it. The failure is silent and lands on data the reader can see. |
| **C. A nested value** — `items` holds an array of objects | Natural to read and to serialise, and it is what the database will be handed anyway. | Not kept. It makes stage 5 recursive, and stage 5 is the file that must stay boring. The dirty path and the draft would both need a second meaning. |

## Decision

**1. A row's fields are flat paths under a stable key.** `items.r1.label`. The key is opaque to everything except the write: nothing parses it, compares it or orders by it.

**2. The repeater's own path holds the ordered list of row keys.** `state["items"]` is `["r1", "r2"]`. That single value is both the order *and* the membership, which is what makes the rest work: the tree is resolved from it, so every `items.<key>.<field>` path exists in the map the boundary checks against, and a path naming a row nobody declared is refused by the rule that already refuses everything else.

Adding a row is appending a key. Removing one is dropping it, and the fields under it stop being paths the moment it goes. Reordering is rewriting that list and nothing else.

**3. The list is admitted like any other value.** It arrives from the client, so it is judged: an array of strings, within `.maxItems()`, no duplicates. A repeater is the first field whose value decides what other paths mean, and that is exactly why it is checked before any of them is.

**4. What the key means at write time is decided by the record, not by the key.** The children loaded with the row are the only keys that may be updated; every other key is a create, whatever it looks like. A client inventing a key that resembles somebody else's id creates a row, and cannot reach one.

## Consequences

- `sanitize.ts` does not change. That is the point of the whole record.
- The order of the resolution matters for the first time: the repeater's own value has to be admitted before the paths beneath it can be built. This is a real ordering constraint in a cycle that had none, and it is where the implementation will be most tempted to cut a corner.
- A row key crosses the wire and appears in the payload. It is opaque and it is not a secret — but it is also not an address: decision 4 is what stops it becoming one.
- Deleting a row and re-adding it in one pass is two different keys, so it is a delete and a create rather than an update. That is the honest reading of what the reader did.
- `maxItems` becomes load-bearing rather than decorative: it is what bounds how many paths one request can invent.

## Reopening rule

**One:** a repeater has to contain another repeater, and the key scheme cannot express the nesting without becoming a parser. Then decision 1 is revisited with the depth cap `path.ts` already applies to relations.

**Two:** the state protocol gains a way to name more than one dirty path per round trip. Then option C stops costing what it costs, and the trade in this record should be weighed again.

Does not reopen this: that `items.r1.label` is uglier than a nested array. It is, and the boundary that reads it is the file least worth making interesting.
