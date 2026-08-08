# ADR 0011 — Client state is admitted in waves, not in one pass

**Status:** proposed · **Scope:** Perch (`@perchjs/nest`) · **Amends stage 5 of ARCH 12 §2**

## Context

ARCH 12 §2 runs the trust boundary once: stage 4 builds the tree, stage 5 confronts the incoming state with it, stage 6 reduces. `sanitize()` says what it wants to be confronted with — "the tree the server last resolved" — and refuses the alternative in the same breath: "deciding from the incoming state would be asking the attacker to mark their own work."

A stateless HTTP server does not have the tree it last resolved. It has the record, the operation, and whatever the client sent. So stage 4 has exactly one trusted starting point, and the first implementation of `/state` used it: resolve the tree from the record, confront the payload with that.

That is where it broke.

## What verification established

Measured against the A1 form — a `Select` for the city, visible only once a country is chosen, its options resolved from the country.

1. **One pass loses the city, permanently.** On the exchange after the country is picked, the tree resolved from the record alone still has `cityId` invisible, so the value the user just chose is discarded as an invisible field. Every time. The HTTP test fails on exactly that assertion when the bound is set to one.
2. **Two productive passes settle A1.** Pass 1 admits `name` and `countryId`; pass 2 admits `cityId`; pass 3 admits nothing new and stops.
3. **The cascade cannot be bootstrapped.** With a field visible only when a read-only field holds a given value, and a client forging both halves: pass 1 admits `name` alone, pass 2 admits nothing further. The read-only field is refused, so the field it gates never becomes visible.
4. **Raising the bound admits nothing extra.** At twenty passes the gated field is still refused, so convergence is not the thing holding the boundary — the rule is.
5. **It does not show in the budget.** The round trip measures 1.59 ms p95 with the passes included, against 150 ms.
6. **It does not always settle.** Two fields each visible only while the other is empty admit both, then neither, then both again, indefinitely: `[a,b] → [] → [a,b] → []`. The waves have a fixed point only when the gates are monotone, and nothing forces an author to write them that way. Security survives it — every admitted set is still justified by a tree resolved from admitted values — but the answer would be whichever set the bound happened to stop on.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Admit in waves until nothing new is admitted** | dependent fields work; nothing the client sent decides its own fate | **proposed** |
| **B. Confront with a tree resolved from the payload** | one pass, everything reachable | rejected: it is the sentence `sanitize()` was written to refuse. A hidden field would authorise itself |
| **C. Carry the previous tree between requests** — session, or a signed snapshot | one pass, and the tree really is "the one the server last resolved" | rejected for v0.1: a session makes the panel stateful and breaks under more than one process; a signed snapshot puts the whole tree on the wire twice and makes the signing key a new thing to get wrong. It is the honest answer to the same question and it costs a great deal more |
| **D. Let the client mark which fields it changed** | the server trusts a narrower set | rejected: the client would be telling the server what to trust, which is the boundary reversed |

**Why C deserves the second line rather than a dismissal**: it is the only option under which stage 5 means literally what it says. A is a reading, C is the thing itself. What decides between them here is that A needs no new state, no new key, and no assumption about how many processes serve the panel — and that its security property can be stated in one sentence and tested.

## Decision

**Incoming state is admitted in waves. Each pass resolves the tree from the values already admitted and confronts the payload again, until a pass admits nothing new — or, failing that within five passes, the request fails.**

1. **The chain starts from the record**, which the client never touched.
2. **A field is admitted only if the tree resolved from already-admitted values says it may be.** A hidden field can therefore be unlocked only by a field that is itself editable.
3. **A refusal stays silent**, as before. Nothing in the answer distinguishes a field that was refused from one that does not exist.
4. **Reaching the bound is a failure, not a stopping point.** The resolution cycle throws past five passes rather than answering with an unsettled state, and this does the same: contradictory gates raise, naming the paths in the server log while the client gets a plain 500. Truncating instead would answer correctly-but-arbitrarily, which is the worst of the three.
5. **ARCH 12 §2 still describes one pass.** This record does not edit it; stage 5 needs a pass once this is accepted.

## Consequences

1. The tree is resolved once more per productive wave — three resolutions for A1 where one would have done. It does not show at 1.59 ms p95, and it will show first on a form with many gates. The budget is where that argument gets settled.
2. The property that makes this safe is not obvious from reading the loop, so it is asserted rather than commented: a field gated on a refused value stays out, at one pass and at twenty.
3. A form whose gates contradict each other stops working rather than misbehaving quietly. That is a real restriction on what an author may write, and it is deliberate: the alternative is a form that admits different fields depending on a bound nobody reads.
4. This lives in `@perchjs/nest`, not in `@perchjs/core`. A second adapter would have to repeat it or it would not hold — which is an argument for moving it into the engine, and a reason to look again when a second adapter is real rather than hypothetical.

## Reopening rule

**Two, and only two:**

1. **A second inbound adapter exists**, at which point the rule belongs in `@perchjs/core` rather than being written twice.
2. **The passes become measurable in the round trip** — the p95 budget of PRD 03 crossing 150 ms with the wave count shown to be why. Option C is then what it costs.

Does not reopen this: that ARCH 12 §2 describes one pass. Whether the specification or the code moves is the question this record puts, and it is not answered by pointing at either one.
