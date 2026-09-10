# ADR 0030 — How a closed vocabulary arrives

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`)

*Settles consequence 6 of [ADR 0027](0027-what-an-icon-is.md), which left the migration owed and unsettled. Nothing else in that record is reopened.*

## Context

ADR 0027 closed the set of icon names and ended with a consequence it did not resolve: *"A migration is owed. `icon` accepts anything today and would accept only names after; whether the old spelling is refused or merely deprecated is not settled here."*

It was built as a refusal — at once, with no window, no flag and no warning-then-accept — and the code says so unambiguously while no record does. A reader looking for the migration path finds a consequence saying the question is open and a codebase that answered it.

## What verification established

1. **The migration is owed to nobody.** All six packages sit at `0.0.0`, which ADR 0008 decision 1 says is never published. There is no tag and no CHANGELOG. Nothing has been released, so no panel exists that a refusal could stop from booting.
2. **The refusal is complete wherever the boot can see a declaration.** Six options on a component, a group's mark, an empty state's, and the mark a resource names in its decorator. The type carries the other half: a literal that is not a name does not compile, so the honest mistake never reaches the boot at all.
3. **This repository has never deprecated anything.** The word does not appear anywhere in the core, tests included. The one closed vocabulary that came before — a modal width — is refused at boot and was never given a soft period, so there is no machinery to reuse and no precedent to follow but this one.
4. **The soft failure for a mark is silence, and it was measured rather than imagined.** A name the panel cannot draw draws nothing: no gap, no box, no fallback, nothing on the screen and nothing said. Two declarations went unread while the drawings landed — the walk an infolist runs, and the mark a resource names for its menu — and both turned from a wrong-looking character into nothing at all on the same day. Neither was reported by anything; both were found by reading.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Refuse at once** | one behaviour to explain, one moment to find out, and the closed set is closed the day it is declared closed. | **Kept.** |
| **B. A window: accept the old spelling, warn, refuse later** | an upgrade path for panels that exist. | Not kept. There are none (finding 1), and the window has a cost that outlives its purpose: accepting a character for a release means shipping, on purpose, the defect the set exists to remove — a mark at a weight nobody chose beside marks at the panel's own. It also means keeping alive every branch that prints a name, which is what this work removed. |
| **C. Accept forever, warn only** | nothing breaks, ever. | Not kept. It is finding 4 with a log line: the screen still shows nothing, and the warning is read by whoever is tailing the server rather than by whoever is looking at the panel. A vocabulary that is only advisory is not closed, and the guarantee ADR 0027 decision 1 makes — one shape, one weight, whoever declared it — is gone. |

## Decision

**1. A word that leaves a closed vocabulary is refused at once.** No deprecation window, no flag, no accept-and-warn. For icons this is what is built and what stays built.

**2. Where the boot cannot see the declaration, the mark draws nothing, and that silence is correct.** The boot reads what a resource declared; a plugin written in JavaScript or a value cast past the type can still put any string on the wire. That case is ADR 0027 decision 5 and it is not a migration path — it is the residue the type and the boot together cannot reach, and drawing nothing is the least that can be done about it.

**3. Growing the set is additive; removing a name is breaking.** A name added is a name nobody was using. A name removed refuses a panel that booted yesterday, so it lands on a minor, which ADR 0008 decision 2 already makes the breaking unit before 1.0.

**4. The next vocabulary to close arrives the same way, while nothing is published.** Closing a set is cheap exactly once — before the first release — and the cheapness is not a property of icons. Any word the boot can read and the type can name is closed now rather than after, and the record for it can point here instead of re-deciding.

## Consequences

- **ADR 0027's consequence 6 is answered.** The migration it said was owed is owed to nobody, and the answer to refuse-or-deprecate is refuse.
- **A misspelling is found three ways, in this order:** it does not compile; if it was cast or came from JavaScript, the boot names it and stops; if it never reached the boot at all, the panel draws nothing. Only the third is quiet, and only a client can cause it.
- **The first published version ships a closed set with no history.** Nobody upgrading into `0.1.0` has an old spelling, because there is no version before it.
- **A word closed after release will cost more than this one did**, and that is the case decision 4 exists to keep rare rather than to forbid.
- **No deprecation machinery is added**, so the first time one is genuinely needed it will be written from nothing. That is accepted: building it now to use it never is the more expensive mistake.

## Reopening rule

**One:** a vocabulary has to be closed after a version is published — a word that was free becoming a name, for panels that already boot. Decision 1 was taken while that cost was exactly zero, and it would no longer be; a window would then have to be weighed on its merits rather than dismissed on finding 1.

Nothing else. In particular, closing a set before the first publish does not reopen it: that is decision 4, and it stays free for as long as the registry has never heard of us.
