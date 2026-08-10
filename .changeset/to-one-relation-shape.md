---
"@perchjs/prisma": patch
---

Send a single value on a to-one relation write, not a list.

Prisma refuses `connect: [{ id }]` where it expects one row
(`Expected AuthorWhereUniqueInput, provided (Object)`), so every nested write
through a to-one relation failed. The unit tests asserted the list form against
a recorder, which accepts anything; the new integration tests run against a real
database and caught it.
