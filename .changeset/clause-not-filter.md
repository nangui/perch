---
"@perchjs/core": minor
"@perchjs/prisma": minor
---

`Query.filters` is `Query.clauses`, carrying `Clause` and `ClauseOperator`.

What the port describes is one condition — a path, how to compare it, and to
what. What a resource is about to be able to declare is a filter: a label, a
control, and the guarantee that the path and the operator come from the
declaration while only the value comes from outside. Those are two things, and
calling both of them `Filter` left the second with no name.

No behaviour changes. The rename lands on its own so the filters that need the
name arrive without a refactor underneath them.
