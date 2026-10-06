---
"@perchjs/ui": patch
---

Close the two colours a theme could not reach, and hold the token layer to what its own header promises.

`styles.css` opens by saying "Not one raw colour appears below. Every value is a token from `tokens.css`, which is what makes the panel re-themable by replacing that one file." Measured, it was not quite true, in two places — and both were invisible to every guard in the repository.

**A modal's backdrop named its own ink.** `rgb(20 24 26 / 0.4)`, written into the component, so the one layer that covers the whole screen was the one layer a theme could not restyle, and it stayed light-ramp dark on a dark panel. It is now `--perch-overlay-scrim`, declared in both ramps and heavier in the dark one, because a scrim has to read as a layer over a ground that is already dark.

**The column picker read a token that is declared nowhere.** `var(--perch-shadow-2, 0 8px 24px rgb(0 0 0 / 12%))` — no `--perch-shadow-2` exists, so the fallback beside it was always what rendered: the only shadow in the file a theme could not change, carrying a raw colour in a file that says it names none. It now takes `--perch-shadow-popover`, which is what every other floating thing takes.

The guard that should have caught it exempts a `var()` fallback on purpose, because `var(--perch-columns, 1)` is a runtime value a renderer sets rather than a token. The exemption is now about colour instead of about declaration: **a length may have a fallback and a colour may not**, since a colour behind a `var()` is a colour no theme can replace. A second guard holds the header's own sentence — no raw colour anywhere in `styles.css` — reading the file with its prose stripped, so a comment explaining the hex a token was lifted from is still a comment doing its job.

Both were probed by putting each hole back, and each names its offender when it fails.

Also: five small controls gave their height as `28px` where `--perch-control-height-sm` is that height and says so — a markdown tool, a rich-editor tool, a calendar day, a code bar, and the calendar's own loading shape.

Not changed, deliberately: the `24px` touch targets and the `2px` hairlines. Both coincide in value with a spacing step — `--perch-space-9` and `--perch-space-1` — and replacing them would couple a minimum target size and a border width to the spacing scale, so a theme that re-spaced the panel would silently shrink what a reader has to hit.
