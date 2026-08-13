---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Load what a relation column reads, in one query.

`buildIncludePlan` had no caller outside core: the machinery for reading through
a relation without an N+1 was built end to end and the table never asked for it,
so `author.name` rendered blank on every row. The plan is now derived from the
columns — one, merged, per page — and a column reading a path the model does not
have stops the boot rather than rendering empty forever.
