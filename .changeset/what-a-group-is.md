---
"@perchjs/core": minor
"@perchjs/prisma": minor
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Gather a table's rows into groups. `Table.make().groupBy("status")` orders the page by that column ahead of anything the reader asked for, opens a header where the rows cross a boundary, and says how many rows are in the whole group rather than how many of them the page holds. A header shuts, hiding rows the browser already has.

`DataAdapter` gains `groupBy`, which is breaking for an adapter written outside this repository and rides the same minor as `aggregate`. The upgrade guide shows the shape and the three things it owes.

Only the groups a page draws are asked about. A header opens where the rows cross a boundary, so there is nowhere to draw the rest, and asking about them would be a read that grows with the table. The keys come off the rows already in hand, so nothing is capped: a page cannot hold more groups than it holds rows. A page holding rows with nothing in that column costs a second read, `in` over a list holding nothing matching no row and there being no single clause for one of these or nothing. Those rows are a group keyed null rather than rows left out of a list that says it is showing them.

What a column has to be to gather anything is read from the schema at boot: a string, a number, a boolean or an enum. A timestamp is refused, and it is the grouping you will want first. Grouped as it stands every distinct instant is its own group, which is a header above every row, and bucketing by the day or the month needs the database to truncate the value: a hand written statement behind a port that exists not to have one. ADR 0033 records that, what else is refused, and the condition under which `aggregate` and `groupBy` become one method.
