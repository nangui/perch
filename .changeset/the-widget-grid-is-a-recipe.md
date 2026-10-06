---
"@perchjs/ui": patch
---

Draw the dashboard's grid from a recipe, and fold it where the rest of the panel folds.

Forty lines of hand-written CSS leave. What replaces them is a slot recipe, so the grid and its cells are generated alongside the card they hold rather than beside it in a different file.

**It also fixes a breakpoint nobody designed.** The grid arrived with a `720px` of its own — the only one in the stylesheet, where five other rules narrow at `40rem`. Two and a half rem apart, so a window between them folded the page one way and the widgets another. The recipe uses the panel's own width, and there are seven rules at it now instead of five.

The two classes are renamed by the move: a slot gives every part a suffix, so `.perch-widgets` is `.perch-widgets__root` and `.perch-widget` is `.perch-widgets__item`. Neither has been released, so there is nothing to upgrade.

The bundle is unchanged at 116.01 kB gzip and the stylesheet went from 12.65 kB to 12.72 — the engine was already paid for, and a recipe costs about what the rules it replaced did.
