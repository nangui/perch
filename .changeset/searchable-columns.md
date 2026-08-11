---
"@perchjs/core": minor
"@perchjs/prisma": minor
"@perchjs/nest": minor
---

A column can declare itself searchable, and only then is it searched.

`TextColumn.make("email").searchable()` lets a term reach that column. A search
is an oracle in the way a sort is — asking whether any row contains
`@acme.com` answers a question about a value nobody displayed, and repeating it
letter by letter reads it out — so an undeclared column is not searched, and
the allowlist is built where the declaration is read.

`Query.search` carries the term *and* the paths it may reach. The adapter used
to pick the label field itself, with a comment saying that widening it belonged
to whoever declares which fields are searchable; this is that. Paths are dotted
like a sort's, so `author.name` reaches through a relation in the same query,
verified against a real PostgreSQL rather than asserted.

A resource with no table still searches the field a human reads it by. A table
that declares no searchable column searches nothing — not everything.

The term is capped at 200 characters, for the reason `perPage` and `page` are:
an `ILIKE` pattern is compared against every row and costs what it is long.
Truncated rather than dropped, since dropping it returns every row.

The column tree carries a single `searchable` flag, which is all a client needs
to decide between offering a box and offering nothing. Which columns it reaches
is not sent: that would answer the question the allowlist exists to refuse.
