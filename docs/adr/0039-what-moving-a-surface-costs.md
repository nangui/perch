# ADR 0039 — What moving a surface costs

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`) · **Extends:** ADR 0038

## Context

ADR 0038 decided that Panda writes the stylesheet, and named one hazard in its consequences: two ways of writing this coexist until the last surface moves, and a surface converted without deleting the rules it replaced renders from the old ones.

Three surfaces have moved since — the stat card, the dashboard grid, the control frame and everything inside it. The hazard it named turned out to be the small half of what a move actually costs. The rest is written down here because it was all discovered the same way: by moving something and then attacking the result, rather than by reading the engine's documentation.

This record is procedure. It changes no decision in 0038 and adds none about which engine or which names; it says what has to be done each time a surface moves, because three times out of three something was found that nobody would have looked for.

## What verification established

1. **A moved surface sits in a layer, and every unlayered rule outranks it whatever it carries.** Measured on the sheet the panel serves: `@layer base` covers bytes 27 to 9465, `@layer tokens` 9482 to 11638, `@layer recipes.slots` 11704 to 14390, and the hand-written rules begin after all three. The control class appears nine times inside `base` — its own rules — and five times unlayered, which are the contextual overrides other surfaces write about it. Those still win, as they did before, but by cascade origin rather than by specificity.

2. **A rule written to lose cannot be left behind.** Two of them were: the focus-ring floor and the icon box, both `:where()` and therefore carrying no specificity at all, both written to defer to anything that claims the same property. That design holds only inside one cascade origin. Left in the hand-written sheet they would have been unlayered, and the floor would have outranked the control focus style it exists to defer to.

3. **A specificity argument about a moved surface becomes false.** One was written down: the shared hover was held by two `:not()` clauses, which beat any selector a cell could write. In a layer it is beaten by any unlayered rule however little it carries. What holds it now is that nothing writes one — weaker, and the truth.

4. **A guard written when the hand-written sheet was the stylesheet guards less with every move, and never fails while doing so.** Seventy-seven `var(--perch-*)` reads had moved into the generated sheet, because some rule values name a property directly rather than through a token: a border colour inside a shorthand, a negative margin inside a `calc`. The guard that holds every read to a declaration was reading the other half. Probed: a token misspelled there produces a control with no border, and nothing said so.

5. **The same for colour.** A raw colour written in a generated rule was unguarded, and closing it needed the token layer read apart from the rules — the values legitimately live in one and not the other.

6. **Sixteen test files read a stylesheet, and eight read only the hand-written half.** None is vacuous today. `button-cascade.test.ts` was the one to suspect, since it builds a control and asks jsdom for its height; checked, and the height it compares comes from a contextual rule that has not moved. So this is latent rather than broken, which is the only reason it is a procedure below instead of a fix.

7. **A test that names a token has to accept two spellings.** A hand-written rule reads `--perch-focus-ring`, the property a theme overrides; a generated one reaches it through `--perch-shadows-focus-ring`, the alias the engine names after its category. Three assertions in two files needed widening.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Carry on and catch these as they appear** | No procedure to keep. | Not kept. Three for three were found by attacking the result, not by it failing — which means the next one is found by luck or not at all. |
| **B. Move the whole stylesheet in one change** | No coexistence, no half-guarded guards. | Not kept, and 0038 decision 7 already said why: five thousand lines in one commit is a change nobody can review. |
| **C. Put the hand-written sheet in a layer too** | Layered against layered, so specificity decides again everywhere. | Not kept. The contextual overrides other surfaces write — a search row's control, a cell's quiet frame — have to win, and a layer that lets them also lets every stale rule win. It trades a known hazard for a quieter one. |
| **D. A procedure per move, written down** | The three things that were missed, checked rather than remembered. | **Kept.** |

## Decision

**1. A surface moves with every zero-specificity rule that defers to it.** Verification 2. A `:where()` rule is not a surface of its own; it is a floor under one, and a floor in a different cascade origin is a ceiling.

**2. Before a surface moves, the guards that read the stylesheet are listed and each is asked which half it reads.** Verification 6: eight read one half today, and the listing is what makes that a fact rather than a recollection. A guard about the surface being moved is widened in the same change, not after it.

**3. A specificity argument about a moved surface is rewritten or deleted.** Verification 3. Left standing it is a comment that explains why something is safe using a mechanism that no longer applies, which is worse than no comment: the next reader trusts it.

**4. A guard reads both halves, unless it is about where a value may be written.** The colour guard is the exception and the only one: the token layer is where a colour belongs, so it reads the rules apart from the declarations.

**5. A test that names a token accepts both spellings while both sheets exist.** Verification 7. Not a token-by-token allowance — one pattern per token, written once, so the second sheet leaving removes it in one place.

**6. Each move is probed, not reviewed.** Every defect in verifications 2 to 5 was found by breaking the thing deliberately and watching what did not fail. A surface moved and read over is a surface nobody has tested.

**7. Deliberately not here:** which surface moves next, and whether the alias indirection earns its cost. The second is a real question — it is what makes verification 7 necessary — and it is worth asking once the sheet is small enough that the answer is cheap either way.

## Consequences

- **Each move is larger than its diff.** The controls were 203 lines of CSS and five test files, of which two were defects the move created and three were accommodations it required. A surface should be costed that way rather than by its rules.
- **The procedure shrinks as the migration finishes.** Decisions 1, 3 and 5 exist because two sheets exist. When the hand-written one is gone they are dead letters, and that is the right end for them.
- **Nothing here protects against the move that is never made.** A surface left half converted — its rules deleted and its recipe not written — fails loudly, which is the one shape of this that needs no procedure.
- **Decision 6 is the expensive one.** Probing each move costs a build and a run per claim, and it is what found all four defects. The alternative was found to be reading, three times.

## Reopening rule

**One:** the hand-written sheet is gone. Then decisions 1, 3, 4 and 5 have nothing left to apply to and this record is spent, which is worth saying explicitly rather than leaving a procedure nobody can retire.

**Two:** a move produces no finding under decision 6 twice in a row. Then probing every claim may be costing more than it catches, and the question is which claims are worth probing rather than whether any are.

**Three:** the eight guards in verification 6 are widened as a batch rather than per surface. Then decision 2's "in the same change" is the wrong granularity and should say so.

Does not reopen this: that a procedure is not a decision. The alternative was relying on whoever moves the next surface to think of four things nobody thought of the first three times.
