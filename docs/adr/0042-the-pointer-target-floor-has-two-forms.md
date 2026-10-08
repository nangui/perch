# ADR 0042 — The pointer-target floor has two forms

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`) · **Supersedes one clause of [ADR 0040](0040-what-a-stylesheet-guard-promises.md)**

## Context

ADR 0040 decision 1 listed what the suite promises and named the pointer-target floor as *"a pointer target of at least 24 × 24"*. That is one of the two forms WCAG 2.2 §2.5.8 offers, and it was the only one the panel used — until the radio's dot was looked at, which is the one surface that cannot meet it.

So the clause as written refuses something the suite now asserts, and a record that refuses what the code does is worse than no record. This replaces that clause and nothing else.

## What verification established

1. **The radio's target is 18 px tall and cannot hold a 24 px square.** The target is the dot and the label its `for` reaches; the dot declares 18, and the label at 13 px makes a line box of about 16, so the dot is what sets the height. Read from the generated sheet, the same way every other target here is read.

2. **§2.5.8's second form fits it, with nothing to spare.** An undersized target conforms where a 24 px circle centred on it meets neither another target nor another's circle. Stacked, the dot's 18 plus the 6 px between options puts 24 between centres: two circles of radius 12 touch without overlapping, which the criterion allows. The circle-to-box half has 3 px in hand, the circle-to-circle half has none.

3. **Laid out in a row it is never the binding measurement.** The inline gap is 12 px and a target there includes the label's own width, so the horizontal distance between centres is larger than the vertical by whatever the words are.

4. **Neither form was asserted for this surface at all.** Measured before any of this: the dot shrunk to 4 px, its focus outline deleted and its checked colour removed, and all 3 604 tests passed.

5. **The floor was named by a number where the criterion was meant.** `target-size.test.ts` has carried `2.5.8 Target Size` in its own `describe` since it was written, so the record was the only place that reduced the criterion to one of its forms.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Redraw the dot at 24 × 24** | The clause stands as written, one form for everything. | Not kept. It changes a drawing to suit a record's shorthand, and 18 px is what a radio is; the circle inside would have to be redrawn with it. |
| **B. Leave the clause and let the code differ** | Nothing to write. | Not kept. The clause would refuse the dot look while the suite asserts it, which is the kind of stale record ADR 0039 decision 3 was about. |
| **C. Name both forms** | The floor is the criterion rather than one of its numbers. | **Kept.** |

## Decision

**1. The pointer-target floor is §2.5.8, both of its forms.** A target of at least 24 × 24, or — where it is smaller than that — spacing such that a 24 px circle centred on it meets neither another target nor another's circle. This replaces ADR 0040 decision 1's *"a pointer target of at least 24 × 24"* and leaves the rest of that decision as it stands.

**2. A surface taking the spacing form asserts the arithmetic, read from the rules.** Not from a token named in the test: the first version of this one read `--perch-space-3` by name rather than the gap the rule declares, so narrowing the gap left it green — it was asserting arithmetic on a number it had chosen itself.

**3. It also asserts that the size form is still out of reach.** So if the control is ever redrawn big enough, the spacing assertion is deleted rather than kept as a weaker duplicate of the stronger one.

**4. The margin is named where the assertion is.** Twenty-four exactly is conformance and it is also nothing in hand. A reader tightening a gap by one step is entitled to find that out from the file rather than from an audit.

**5. Deliberately not here:** whether an 18 px dot is the right drawing. That is a question about the design. What was missing was not an answer to it but anything at all holding the conformance the panel already had.

## Consequences

- **This floor cannot be read off one rule.** Every other one in ADR 0040 decision 1 is a property of a single declaration; the spacing form is a property of a target and its neighbours. That is why it is the only one with arithmetic of its own rather than a line in a roster.
- **The guard is wider than the box it replaces.** It fails on a change to the dot or to the gap, where a size assertion would have seen only the dot. Both probed.
- **A surface that needs neither form still needs no test.** ADR 0040 decisions 2 to 5 are untouched: a floor applies where it applies, and a surface it does not reach is not uncovered.

## Reopening rule

**One:** the dot is redrawn at 24 or more. Then the spacing form is unnecessary here, decision 3 fires, and if no surface is left taking it this record is spent along with the assertion.

**Two:** a second surface needs the spacing form. Then "the only one with arithmetic of its own" stops being true, and whether the two deserve a shared reading is worth asking rather than copying the first.

Does not reopen this: that twenty-four exactly is tight. It conforms, and decision 4 is what makes any tightening of it visible instead of silent.
