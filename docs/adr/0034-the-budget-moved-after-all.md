# ADR 0034 — What a page costs, written as a shape rather than a number

**Status:** accepted · **Scope:** Perch (documentation)

*Corrects the deferral in the consequences of [ADR 0033](0033-what-a-group-is.md). What that record decided about groups is not reopened: only its sentence saying the budget would not be moved.*

## Context

ADR 0033's consequences read: *"This record does not move it. What it owes is saying that the number is now wrong rather than leaving somebody to find out from a guard."*

It has since been moved. A reader following that record to PRD 07 §9 finds a line that was changed by a decision no record carries, which is the state this folder exists to prevent.

## What verification established

1. **The number was already wrong, and not by anything ADR 0033 built.** PRD 07 §9 budgeted *"**≤ 3** (count + rows + filters)"*. The scenario two rows above it in the same table is eight columns of which two are relations, and `tooling/database.test.ts` has measured that page at four since relation includes were measured, commenting the composition: the page, its count, the authors, the comments. The line contradicted a test in the same tree, for the shape the table named, before a footer or a grouping existed.

2. **An absolute number is the wrong instrument, and this repository already said so.** The counter that budget is held by comments: *"An absolute number would pin Prisma's join strategy, which is its choice to make. What may not happen is growth with the row count."* A release folding two reads into one join would read as a regression against a number, and as the improvement it is against a shape.

3. **Every part of what a page costs is measured somewhere.** The rows and their count and one per relation in `tooling/database.test.ts`; a footer's single statement and a grouped read's single statement in the same file; a footer's second statement in `packages/prisma`; a grouped page's second read in `packages/nest`. The replacement is assembled from those rather than reasoned out.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Leave it, and leave ADR 0033 reading as current** | Nothing to write. | Not kept. A line changed by a decision nothing records is a line somebody will change back. |
| **B. A record superseding ADR 0033** | One record to read. | Not kept. ADR 0033's decisions about what a group is all stand, and a superseding record would have to restate every one of them to keep them. |
| **C. A narrow record correcting the one sentence** | The deferral is answered where a reader of it will look, and the rest of ADR 0033 stays where it is. | **Kept.** The shape [ADR 0029](0029-what-a-decision-may-name.md) established for correcting one point of an earlier record. |

## Decision

**PRD 07 §9 says what a page costs as a shape, and no number.** Constant in the row count, with the composition written out: the rows, their count, one per relation loaded, one more for a footer, one more for a grouping, a second grouped read where a page holds rows with nothing in the grouped column, and a second aggregate where a footer wants both a count of rows and a count of a column.

**Acceptance criterion 2 is corrected the same way.** It repeated the same three. What was doing the work there is *no per-row query*, which stays; the number becomes the comparison a counter can actually make, which is the same page over five rows and over thirty-five.

**ADR 0033 is not edited**, and its deferral stands as what that record did.

## Consequences

- The budget is now a claim a counter can fail, which the old number also was and was failing in silence.
- It names more reads than it did, and a reader comparing releases will read that as the panel having got slower. It has not: the composition is what was always there, and the three was never measured.
- Nothing in `tooling/` guards this prose, there being no number in it to count. What holds each clause is the test that measured it, listed in verification 3.

## Reopening rule

**One:** a counter is written that can hold the whole composition at once, rather than one clause per test. Then the prose is a summary of a guard rather than a list of them, and should say so.

**Two:** PRD 07 §9 gains a number again, by somebody deciding that pinning the join strategy is worth it. Then verification 2 is being overruled on purpose and a record should say why.

Does not reopen this: finding the list long. Its length is what a page costs.
