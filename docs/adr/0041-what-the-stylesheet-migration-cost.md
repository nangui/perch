# ADR 0041 — What the stylesheet migration cost

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`) · **Retires:** ADR 0039

## Context

ADR 0038 decided that Panda writes the stylesheet and said, in its decision 7, that the surfaces would move one at a time because a five-thousand-line rewrite in one commit is a change nobody can review. ADR 0039 then wrote down what each move had to check, because three moves out of three had turned up something nobody would have looked for.

The last rule moved. ADR 0039's first reopening rule says what to do about that — *"the hand-written sheet is gone. Then decisions 1, 3, 4 and 5 have nothing left to apply to and this record is spent, which is worth saying explicitly rather than leaving a procedure nobody can retire."* This is that, and it records what the procedure found while it ran, because the finding rate is the only argument for having had one.

## What verification established

1. **Twenty-seven commits moved a surface, across thirty-seven.** The sheet went from 5 188 lines, with 223 more in `tokens.css`, to sixteen — a header and an `@import`. `panda.config.ts` is 5 344. So this was not a reduction: the design relocated almost line for line, and what was gained is that the compiler now reads it.

2. **The procedure found something on every move it was written for, and kept finding after.** The defects were real rendering faults, not untidiness: a select filter grew to the full control height and a disabled one lost its grey; a hovered editable cell lost its frame and a pending one its border; a select's chevron stopped turning on focus; an inline choice group took the colour picker's gap from a selector fragment left soldered to it; the focus mark on a radio could not be seen at all; and twice the sheet stopped importing the generated one, which is a panel with no styles that every gate passed.

3. **Every one of those was caught by a floor or by a probe. None by a test about how a surface looks.** That is the measurement ADR 0040 was written from and it held to the end: the last defect of the migration was a deleted `@keyframes`, caught by the one assertion that says an animation must name keyframes that exist.

4. **The tools built for the migration carried the same defect five times.** A leading `@import` lands in the first rule's selector, and a selector read as an at-rule is skipped — so the converter, the property-set diff, the strip, the survey and finally the inverted guard each read past the first rule of the sheet. Three did it silently. It surfaced only because two of them disagreed about a count.

5. **A tool is as blind as its model.** All of them were built around rules with selectors, so none ever saw the single `@keyframes` the sheet held: not counted, not compared, and deleted with the file. Nothing in seventeen moves would have noticed.

6. **Three count floors failed by the migration succeeding.** More than five sections, more than a hundred rules, more than fifty styled classes — each written when the sheet was large, each tripped as it shrank. A floor on a quantity that is being driven to zero is a number nobody maintains.

7. **The published surface did not move.** No class renamed, no custom property renamed, no exports entry renamed — `@perchjs/ui/styles.css` is still the name, now a door. The entry bundle went from 112.45 kB gzip to 113.29 across the whole migration.

8. **Tests that read a stylesheet went from twelve to eighteen.** Three guards were added and still stand — the hidden input's focus mark, the order the engine emits conditions in, and an import of a file git does not carry. Two were added and have been retired: the cascade-origin comparison, and the heading standing over nothing.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Leave ADR 0039 standing** | Nothing to write. | Not kept. Its own reopening rule refuses this, and a procedure whose subject is gone is one somebody will apply to something it was not about. |
| **B. Mark 0039 superseded and say no more** | Correct and cheap. | Not kept. The finding rate in verification 2 is the only evidence that per-move checking was worth its cost, and it is not written anywhere else. |
| **C. Retire 0039 and record what it found** | B, plus the reason to do it again. | **Kept.** |

## Decision

**1. ADR 0039 is retired, not superseded.** Its decisions were about two sheets coexisting and there is one. Nothing replaces them, which is the difference: a superseding record would imply a new procedure for the same question, and the question is closed.

**2. A migration of this shape is checked per step, not per release.** Verification 2: twenty-seven moves, a finding on most of them, and every finding cheap to fix at the moment it appeared. The alternative was one commit nobody could review, which ADR 0038 decision 7 had already refused on different grounds.

**3. A tool written for a migration is held to the same standard as the code it moves.** Verifications 4 and 5. Three of the five readings of that `@import` were silent, and the only thing that caught them was two tools disagreeing — so a second tool reading the same input differently is worth more than a careful one reading it alone.

**4. A guard carries no floor on a quantity being driven to zero.** Verification 6. What those three were really asking is whether the file was read, and that is what they ask now.

**5. The remaining procedure is ADR 0040's.** The question a change to the panel's appearance has to answer is no longer "which half is this in" but "does a floor apply to anything this declares". That is a decision already taken and it is the one that survives this record.

**6. Deliberately not here:** whether `panda.config.ts` at 5 344 lines is a file anybody can hold. It is the same length as what it replaced and the compiler reads it, which was the point; whether it should be split is a question about that file and not about the migration.

## Consequences

- **The hazard this all guarded against cannot recur.** `sheets.test.ts` asks whether the published entry declares a rule at all, which is stronger than anything it asked while two sheets existed and needs no knowledge of which element a rule would have met.
- **The reasoning moved with the rules, eventually.** Two surfaces' reasons were left in the sheet for several releases after their rules moved, and were only noticed when a later move read the region. There is no guard for a comment in the wrong file; the only defence is that a move reads what it is moving past.
- **The engine's choices are visible in the output.** `outline: none` becomes a transparent outline, `flex: 1` becomes three longhands, vendor prefixes appear, and identical rules merge into one selector list. All were accepted as they arrived, each measured against the original.
- **One open question was not created by this and is not closed by it:** the radio's dot is 18 × 18 against a 24 px floor, sitting exactly on 2.5.8's spacing allowance. Named here so it is not lost with the procedure that found it.

## Reopening rule

**One:** the panel grows a second stylesheet, from a plugin shipping CSS or a theme compiled separately. Then cascade origin matters again, and what ADR 0039 learned is worth reading before deciding where that sheet sits rather than rediscovering it.

**Two:** a tool is written to transform this tree in bulk again — a token rename, a class rename, a move to another engine. Then decision 3 is the one to apply first, and verification 4 is the cost of not applying it.

Does not reopen this: that the migration took thirty-seven commits. That was ADR 0038 decision 7's intent, and verification 2 is what it bought.
