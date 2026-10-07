---
"@perchjs/ui": patch
---

Move the schema layouts into the styling config.

Twenty rules and 181 lines: the fieldset, the legend, the callout with its three tones and its leading stripe, the section card, the grid body a declaration's column count drives, the folding title and its caret. Eighteen of nineteen selectors identical in their property sets; the one that differs gained the engine's accessible expansion of `outline: none`.

The `[hidden]` rule the repeater left behind rejoins its own surface, so that split lasted exactly one move.

**The guard for this surface picked its blocks by counting them, and that had quietly stopped working.** It read the first rule at the narrow width and then the next one after the shell. There are several blocks at that width now — the dashboard's grid collapses there too — so counting picks whichever surface happens to be written first. It finds them by what they name instead, and the one claim that is genuinely about position — the shell's rule coming after the rule it undoes, because at equal specificity the last wins — is asserted directly rather than left implied by a lookup.

**And it resolved those blocks beside its `describe` rather than inside its tests.** Probed by deleting the collapse rule: the lookup failed at collection, and the run reported no tests rather than a failing one — which is the vacuous shape this suite exists to refuse. Resolved inside each test now, where a missing block fails something named.

With this, one guard in the repository still reads half the stylesheet, and it covers the table.
