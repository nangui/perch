# ADR 0010 — `/state` answers with the whole tree, not a schema patch

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/ui`) · **Supersedes one line of [ADR 0003](0003-state-protocol.md)**

## Context

Four documents describe the answer to `POST /panel/api/:resource/state` the same way:

- **[ADR 0003](0003-state-protocol.md)**, in its route table: `→ { state, schemaPatch, errors }`
- **PRD 03 §3**, identically, and §3.1: "the server returns the canonical state, a **schema patch** (visibility, options, labels, disabled) and the errors"
- **PRD 02 §4**, stage 7: `DEHYDRATE produce { state, schemaPatch, errors }`
- **ARCH 12 §2**, stage 8: same

What is built answers with the whole serialised tree — `{ schema, state, errors }` — and has done since `serialise()` was written. The renderer consumes it, `TransportClient` reconciles against it, and the HTTP route returns it. No patch has ever existed.

This record exists because the gap is no longer in one place. It is in the engine, in the client, in the transport contract and now in the route, and every step that treats it as settled makes it more expensive to undo.

**The reopening rule of ADR 0003 is not met.** It allows re-examining the transport when "milestone A1 shows unacceptable perceived latency". A1 was measured at **1.59 ms p95 over HTTP** — the opposite. So this is not a reopening on the ground that record anticipated, and it is put as a proposal rather than a correction to be waved through.

## What verification established

Measured on the 40-field form the budget is written against:

1. **The whole tree costs 5406 bytes on the wire**, against a 30 KB budget — 18% of it, at 40 fields.
2. **The round trip is 1.59 ms p95**, against 150 ms. Whatever a patch saves, it is not being spent on latency.
3. **A patch is producible, contrary to a first reading.** The server holds no previous tree — it is stateless, and rebuilds one per request — but it could resolve twice and diff. The cost is one extra resolution plus a diff, in place of serialising a tree it already has.
4. **What a patch would save is unmeasured.** Nothing here has implemented one, so its size is an argument, not a figure.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Answer with the whole tree** | the client renders what it is handed | **proposed** — see below |
| **B. Answer with a patch, as specified** | a smaller answer on large forms | rejected: a patch is only meaningful against the tree the client currently holds, and the client does not always hold the one the server assumed. `TransportClient` abandons a request on timeout and drops answers that arrive out of sequence — legitimately — after which a patch applies to the wrong tree and nothing detects it. A whole tree has no such precondition |
| **C. Both, negotiated per request** | the caller picks | rejected: two answer shapes to keep correct, for a saving nobody has measured. It is the option to reach for **after** the budget is threatened, not before |

**What makes B serious rather than a straw man**: bandwidth is a real cost on a form far larger than forty fields, and four documents chose it deliberately. What sinks it is not bandwidth but sequencing, and that is verifiable rather than aesthetic — `TransportClient` marks a timed-out request abandoned and returns early on any answer that is not the latest. Under whole trees, discarding a late answer costs nothing: the next one carries everything. Under patches, the discarded one carried a change the client will now never apply, and neither end can tell.

## Decision

**`/state` answers `{ schema, state, errors }`: the whole tree as the server resolved it, invisible nodes omitted.**

1. **The client applies nothing.** It replaces what it renders and reconciles state per the zones of ARCH 13 §3. Its job stays "draw this".
2. **The size budget stands** at 30 KB for a 40-field form and is measured in CI. It is what turns this from a preference into a bet with a stated losing condition.
3. **The line in ADR 0003 is superseded, and nothing else in it.** Server-authoritative state, JSON to a React renderer, the four routes: unchanged.
4. **PRD 02 §4, PRD 03 §3 and ARCH 12 §2 still say `schemaPatch`.** They are not edited by this record. They need a pass once this is accepted, and until then the code and the specification disagree in writing rather than in silence.

## Consequences

1. Every answer carries fields the client already had. At 40 fields that is 5406 bytes; at 400 it is untested, and the reopening rule below is where that lands.
2. Omitting invisible nodes matters more, not less, in this shape: the whole tree crosses the wire, so anything not pruned is a leak rather than a redundancy.
3. A patch becomes harder to introduce later — the client will have been written for years without one. That is the real cost of accepting this, and it is why the record exists rather than the habit.

## Reopening rule

**Two, and only two:**

1. **A real form crosses the 30 KB budget** and no pruning brings it back. Option C then becomes the answer, since by then the saving is a figure rather than an argument.
2. **The measured round trip crosses 150 ms** and the answer size is shown to be the reason — which is the reopening rule of ADR 0003, arriving through this record.

Does not reopen this: that four documents said `schemaPatch` first. That is what the record is for.
