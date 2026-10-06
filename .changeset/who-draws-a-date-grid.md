---
"@perchjs/ui": minor
---

Draw the date field's month grid with Ark UI, on a chunk of its own, and replace the `Calendar` export with `CalendarSurface`.

The grid this replaces was hand-written, and it was reachable from the keyboard without being navigable: thirty-one day buttons under a `role="group"`, no `onKeyDown` anywhere in the file, and no keyboard test. Its own comment said as much — *"the real fix is the APG date-grid pattern with a roving tabindex — an open decision, not done here"* — against an architecture that asks for full keyboard navigation in the same table where it names the primitive library. Writing that pattern by hand is the thing that table says not to do.

So the grid is Ark's now: one tab stop for the month, the arrows across it, Home and End to the month's own ends, Page Up and Page Down between months, Enter to commit, and `role="grid"` with real rows and gridcells under it.

It costs the main bundle nothing — it gives some back. The grid loads behind a dynamic import, the way the rich editor already does, so a form with a date on it pays for the segments and pays for the grid when a reader opens one. Measured: the panel bundle went from 119.70 kB gzip to 111.77 kB, because the hand-written grid left it and nothing of Ark replaced it there, and the grid is a 36.33 kB chunk. `bundle-budget.test.ts` holds the split the same way it holds the editor's, because one static import undoes either silently.

The value contract did not move. ISO in, ISO out, never a `Date`, and Ark's own input — which formats and parses by locale — is not used: that ambiguity is what the field exists to prevent. The segments stay the panel's, and what reaches the grid is guarded both ways a typed string fails, since the reader is typing into it.

New in the props: `timeZone`, the zone the field already declared. With it the grid marks the panel's today rather than the reader's machine's, which is the same misreading arriving by the one date nobody typed. A string that is not a zone is ignored rather than obeyed: a column's `timezone` is free text nothing validates, and the date library throws on a name it does not know, so a typo in one stays a word spelled wrong instead of becoming a form that will not draw.

Two behaviours changed, both towards what was already on the screen. A day lent by a neighbouring month is no longer selectable — it is still shown so the grid keeps its height, and it has been greyed with `cursor: not-allowed` all along. And a date field with no value opens on today, where a placeholder fallback had it opening on January 2026 for ever.
