---
"@perchjs/ui": patch
---

Move the control surface into the styling config, keeping every published class name.

Twenty-six rules and 203 lines leave the hand-written sheet: the control frame, its six states, the input, the five affixes, the status marks and the round-trip hairline. They are declared in `panda.config.ts` now, as token references the compiler checks.

**Through `globalCss` rather than as recipes, and that is the decision.** These class names are published — a theme overrides `.perch-control__affix--prefix` — and a recipe cannot emit that name: the styling engine spells a variant `--kind_prefix` and no setting changes it. Written as global rules they keep every name exactly, and the sixteen components that wear them do not change a line. What is given up is a typed accessor per class, which those components never had.

**Two foundation rules moved with them, and had to.** The focus-ring floor and the icon box are both `:where()`, so both carry no specificity at all: they are written to lose to every rule that claims the same property. That design only holds inside one cascade origin. Left behind they would have been unlayered, and unlayered beats every layer however specific — so the floor would have outranked the control focus style it exists to defer to.

**A specificity argument written in a test is now false, and is corrected rather than left standing.** The shared hover was protected by carrying two `:not()` clauses, which beat any selector a cell could write. Being in a layer, it is beaten by any unlayered rule whatever it carries. What holds it is that nothing writes one — weaker, and the truth.

One behaviour changed, towards the architecture rather than away: `outline: none` compiles to `outline: 2px solid transparent` with a 2px offset, which is invisible normally and visible under forced colours, where a `box-shadow` ring is suppressed. Not asked for, kept on purpose.

The stylesheet went from 12.72 kB gzip to 13.05 and the bundle did not move.

**Two guards had quietly stopped covering what they were written for, and the review is what found them.** Both read the hand-written sheet alone, which was the whole stylesheet when they were written. Seventy-seven `var(--perch-*)` reads now live in the generated one, because some rule values name a property directly rather than through a token — a border colour inside a shorthand, a negative margin inside a `calc`. A token misspelled there produced a control with no border and nothing said so. A raw colour written in a generated rule was unguarded for the same reason, and that one needed the token layer read apart from the rules, since the values legitimately live there. Both probed: each fails now, naming the offender.
