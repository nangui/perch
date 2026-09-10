# ADR 0029 — What a decision may name

**Status:** accepted · **Scope:** `@perchjs/ui`

*Corrects the address in decision 2 of [ADR 0028](0028-where-a-drawing-lives.md). The decision itself — two homes, one per kind of drawing — is not reopened.*

## Context

ADR 0028 decision 2 reads: *"`icons.tsx` holds every named mark; `fields/marks.tsx` holds every fitted one."*

The fitted marks now sit at `packages/ui/src/marks.tsx`, beside `icons.tsx`. An ADR is never edited, so the record keeps the address it was written with, and a reader following it arrives at a file that is not there.

## What the sentence had got wrong

**The decision named a place instead of naming what the place holds.** What it settles is that there are two homes, one for each kind of drawing, and that a fitted mark does not live inside the component that uses it. None of that involves a directory. The address rode along in the same sentence, so an ordinary move contradicts the record on paper while honouring it in fact — and a record that can be contradicted by a refactor is one people learn to stop trusting.

**And the address was not going stale — it was already stale, and had been for a long time.** A row menu's ellipsis is drawn by the table and by nothing else; it has never been a field's mark, and it sat under `fields/` from the day it was written. What ADR 0028 decision 5 added was not the fault but the sight of it: turning a folding section's caret into a drawing put a layout's mark in that file, and then made a layout renderer import it by name. A misfiling nobody had to look at became one a reader trips over.

## What verification established

1. **The directory was right about two of the five.** A repeater's grip and a calendar's month arrow are drawn by a field and by nothing else. Against them: a select's chevron is drawn by three fields and also by a column menu and a list's own controls; a row menu's ellipsis is drawn by the table alone; and a caret is drawn by a layout renderer for a folding section and by a repeater for a row.
2. **A layout renderer imports it by name.** `renderers.tsx` names the file directly for the caret, which is what took `marks` off the list in `reachable.test.ts` of components reached only through something else — the last reading that still treated it as a piece of a field.
3. **Nine importers named the old path** — four at the package root, five under `fields/` — and none of them cared which; the move changed a segment in each and nothing else.
4. **The guard is what a reader follows in practice.** `drawings-live.test.ts` holds the two homes by name, refuses an `svg` declared outside them and refuses one path drawn in two files. It was checked against both faults from the new address after the move.

## Decision

**1. The fitted marks live at `packages/ui/src/marks.tsx`.** Decision 2 of ADR 0028 stands whole apart from its address: two homes, one per kind, and a fitted mark still does not live inside the component that uses it.

**2. A decision names what a file holds, and a guard names where it is.** An address is the part of a record that ordinary work is allowed to change, so a record that carries one has built in a way to become wrong. Where an address has to be written down — and it does, or nothing enforces the rule — it goes in the test that enforces it, which fails on the day it stops being true instead of misleading a reader quietly.

## Consequences

- **This record is what a reader of ADR 0028 decision 2 needs**, in the way ADR 0009 is what a reader of ADR 0007's first consequence needs. The old sentence stays as written and stays wrong about one word.
- **The next such record will be shorter.** Decision 2 gives the rule to apply while writing rather than afterwards: say what the file holds, and let the guard carry the path.
- **Nothing about the drawings changed.** Same shapes, same sizes, same slots, same two kinds. This is an address and a habit, not a structure.
- **The tension between decisions 2 and 5 of ADR 0028 is worth remembering as a shape**, not as a mistake to feel bad about: a record that decides several things at once can have two of them disagree, and the one that disagrees quietly is the one that names an address.

## Reopening rule

**One:** the fitted set grows past what one file should hold and becomes a directory. Then decision 1 names a directory rather than a file, and the guard's list of homes changes shape with it.

Nothing else. In particular, a later move is not a reason to reopen this: decision 2 is what makes a later move cost a line in a test rather than a record.
