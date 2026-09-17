---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Add `.visible()` on a column, for the column a reader may not have. It is not the same as one they may take off, and the difference is the point: a column toggled off is a column whose values were read, sent and are sitting in the page, while one refused here is not in that reader's table at all, so its values are not projected out of the row, not presented and never leave the server. The table is narrowed once per request, before anything reads the columns, which is why the heading and the values agree by construction rather than by two places remembering to. It is not writable either: a cell control the list never offered is refused the way a path no column declares is refused. Asked with the reader rather than with a record, since a heading is decided once for a table and asking per row would be the heading equivalent of N+1.
