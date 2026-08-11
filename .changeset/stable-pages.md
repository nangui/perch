---
"@perchjs/core": minor
"@perchjs/prisma": minor
"@perchjs/nest": minor
---

Pages are stable, and the answer says which one it served.

Every read now ends its order on the primary key. A page is one query and the
next page is another, so ordering by a column with repeated values leaves a row
free to come back on both and another on neither — the design calls the fix a
correctness fix rather than a preference, and it is the acceptance criterion
that two consecutive pages never show the same row twice. The port asks it of
every adapter, not just this one.

`/records` answers with `page` and `perPage`, read from the query the server
built rather than echoed back from what was asked — the same rule `sort`
follows. A client that draws its controls from its own request draws a state
the server refused.

The depth cap now bounds the page rather than the offset it produces. Capping
the offset stopped it off a page boundary — `perPage=30` stopped at 10000,
which is no page's first row — so the page the answer reported came back with
different rows when it was asked for again.
