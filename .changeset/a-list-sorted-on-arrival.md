---
"@perchjs/nest": patch
"@perchjs/ui": patch
---

Serve a list in the order its table declared from the first page.

A table's `.defaultSort()` was read by the browser and by nothing on the server. The first page arrived in the database's own order, under a header the browser marked as sorted by the default, and the rows only took that order once something asked for the page again — so the order changed under a reader after their first action. `/records` now applies the declared order whenever no sort was asked for, or the one asked for was refused, and says so in `sort`. The browser marks a header from that answer alone, as it already did for every sort it asked for.
