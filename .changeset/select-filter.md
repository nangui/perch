---
"@perchjs/core": minor
"@perchjs/ui": minor
---

`SelectFilter`, with a static list of choices.

`SelectFilter.make("status").options({ draft: "Draft", published: "Published" })`
narrows a list to one of the values the table named. The closed set is the
point: a text filter passes whatever arrives through to a `contains`, while
this answers only to values it declared, so `filter.status=<anything>` is not a
way to ask whether a row exists with that value in that column.

The declared value reaches the clause, not the string that arrived. A URL
carries `1`, the option holds the number `1`, and an Int column compared
against the string would find nothing and read as an empty table rather than as
a bug.

Choices cross the wire as strings, because that is what a control sends back,
and the declaration turns them into what the column holds on the way in. The
renderer draws a select with an empty first choice — without it a filter can be
set and never unset.

`.relationship()` and `.multiple()` are not here: options that come from a
query are a loading decision, and it deserves its own change.
