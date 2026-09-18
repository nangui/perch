---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add `.alignment()`, `.width()` and `.hideWhenNarrow()` on a column, three of the cross-cutting options the tables PRD lists. Alignment takes logical edges rather than left and right, so a column of numbers stays at the end of the row for a reader in a language that runs the other way. A width is a request a table divides what it has by, asked once on the heading, and anything that is not a CSS length is dropped where it is declared rather than written into the page. `hideWhenNarrow` leaves a column out below the width where a row stops being a row and becomes a stack, which is the same breakpoint the rest of the layout uses and a test says so. It is a layout decision and not a permission: the value is still read and still sent, and comes back when the window is wider with nothing fetched again, which is what separates it from `visible()`.
