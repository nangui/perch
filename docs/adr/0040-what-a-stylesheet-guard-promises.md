# ADR 0040 — What a stylesheet guard promises

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`) · **Extends:** ADR 0039

## Context

Three surfaces moved in a row and each one's survey said the same thing: nothing in the suite reads the rules that draw it. Measured rather than felt — the radio's dot was shrunk to 4 px, its focus outline deleted and its checked colour removed, and all 3 604 tests passed.

Each time the gap was reported and closed where closing it was free: a combobox result row declares 38 px and is now held to the panel's 24 px floor, and the field's textarea joined the two editors in the ceiling guard it had always been described by. Twice it could not be closed for free — the radio's dot is 18 px against a 24 px floor, which is a design decision, and the code editor and the user menu have no property anybody could name a floor for.

So the question stopped being "which surface is missing a test" and became "what is the suite promising". This record answers that, because answering it is what stops the same paragraph being written at the end of every move.

## What verification established

1. **Of 33 class families the generated sheet draws, 20 have a test asserting something about their own look and 13 have none.** Counted by classifying every test that reads a stylesheet: eleven ask the same question of everything, and nine ask about one surface. The thirteen are `checkbox`, `code`, `field`, `icon`, `option`, `radio`, `rows`, `select-create`, `stat`, `toggle-row`, `toggle-text`, `user` and `widgets`.

2. **Being named by a test is not being guarded by one.** The first count said four families were unnamed, which was wrong in the way that matters: `layer-flip.test.ts` names a class for every surface that has moved, and it asks whether a hand-written rule overrules a generated one. It would not notice a dot shrinking to 4 px. A guard's subject is what it asserts, not what it mentions.

3. **The eleven that ask the same question of everything are the ones that found real defects.** Every defect this migration turned up was caught by a floor or by a probe, never by a test about one surface's appearance: a select filter's height and a disabled one's grey, an editable cell's hover frame, a chevron that stopped turning, a dangling selector fragment soldered to the colour picker, a heading over no rules. Across the whole migration not one of the nine surface tests failed on a defect; two failed on accommodations the move required, a token spelled the engine's way and a subject resolved too early. That is not an argument against them — they hold decisions that were expensive to reach — but it is an argument about where the next one should go.

4. **A surface test that would be written to close this gap would restate the sheet.** Drafted and discarded: a test asserting the user menu's panel has a shadow and a radius is a second copy of two declarations, failing the day somebody changes them on purpose and telling nobody anything the day they change by accident.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. A test per surface** | Every family named by something that reads its rules. | Not kept. Verification 4: thirteen tests restating thirteen rule sets, each failing on an intended change. |
| **B. A guard that fails on a surface with no test of its own** | The list shrinks as surfaces are covered. | Not kept. It is option A with a ratchet, and the thing it ratchets towards is the thing verification 4 refuses. |
| **C. Say what is promised and what is not** | The reader learns the shape of the guarantee instead of inferring it from a count. | **Kept.** |

## Decision

**1. The suite promises floors, not appearance.** A floor asks the same question of every surface and fails on any that cannot answer it: a pointer target of at least 24 × 24, a contrast ratio, a focus mark that a reader can see, a value that resolves to a declared token, a rule that does not overrule one the cascade used to give way to, a section heading with rules under it. Whether a card's shadow is the right shadow is not asserted and is not going to be.

**2. A surface test is written when a decision was expensive, not when a surface is uncovered.** The nine that exist are of that kind: why a stacked row carries its heading, why a cell goes quiet at rest, why both writing surfaces stop growing. A new one needs that justification and not a gap in a count.

**3. A floor is widened in the move that reveals it.** This is ADR 0039 decision 2 read the other way round: when a surface arrives with a property a floor already asks about, it joins the floor then — the combobox's result row did, the textarea's ceiling did. A surface with no such property joins nothing, and that is the answer rather than a debt.

**4. The thirteen are not a backlog.** Several are held by floors already — `checkbox` and `radio` by the hidden-input focus rule, `icon` by the glyph rule — and the rest are held by the floors that apply to everything. Listing them here is a measurement, not a list of work.

**5. Deliberately not here:** the radio's dot at 18 px against a 24 px floor. That is a real question about the design and not about what a test promises; it needs a decision about the dot, the spacing allowance it currently sits exactly on, or the floor.

## Consequences

- **A move's survey stops asking for a test and starts asking about floors.** "Does a floor apply to anything this surface declares?" has an answer every time, where "is this surface tested?" produced a paragraph and no action for three moves running.
- **A reader of the suite can tell what it is for.** Eleven files that hold the panel to a rule, nine that hold a decision somebody argued over. That is a smaller promise than the file count suggests and a truer one.
- **Appearance regressions are not caught here.** A shadow changed by accident ships. The honest mitigations are review and the property-set diff each move runs, and neither is a test — which is worth saying out loud rather than leaving somebody to discover.
- **The count in verification 1 will rot.** It is a measurement taken once, not a number anybody maintains, and the method is written down so it can be taken again rather than trusted.

## Reopening rule

**One:** an appearance regression ships and is noticed by somebody other than its author. Then decision 1's "not going to be" has cost something real, and what a surface test would have caught is worth pricing against verification 4.

**Two:** a floor is added that most surfaces cannot answer. Then it is not a floor, and decision 1's definition needs the word that excludes it rather than a judgement call per guard.

**Three:** the hand-written sheet is gone and the migration's probes stop running. Then the third mitigation in the consequences disappears, and whether review alone is enough becomes a question somebody has to answer rather than assume.

Does not reopen this: that thirteen surfaces have no test of their own. That is verification 1, it was the reason to write this down, and it is not an argument against what was decided.
