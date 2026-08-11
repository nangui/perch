---
"@perchjs/core": minor
"@perchjs/nest": minor
---

A table can declare filters, and `TextFilter` is the first.

`Table.make().filters([TextFilter.make("headline").path("title")])` narrows a
list. The name is what a client asks by; the path and the comparison are the
declaration's, in code nobody outside can reach. Only the value ever comes from
a URL, which is the whole reason a filter is not a clause.

A value arrives as `filter.<name>`. Measured rather than assumed: the query
parser hands `filter[x]=1` over as the literal key `filter[x]` rather than
nesting it, so neither form is an object and the dotted one reads better in an
address.

A name nothing declared is dropped in silence, like a sort on an undeclared
column and for the same reason. A resource with no table accepts no filter at
all. A blank value is no filter rather than a filter matching nothing. Values
are capped like a search term — `MAX_SEARCH` is `MAX_TERM` now, since it covers
both.

Two filters under one name throw where the table is read, rather than leaving
one of them unreachable depending on the order they were written in.

The column tree carries the declared filters — a type, a name, a label — and
nothing about what they do. The renderer comes next: nothing yet sends a value.
