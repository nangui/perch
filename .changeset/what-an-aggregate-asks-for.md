---
"@perchjs/core": minor
"@perchjs/prisma": minor
"@perchjs/testing": minor
---

Give the port a way to ask what a set of rows works out to. `DataAdapter` gains `aggregate`, which takes the narrowing a `findMany` takes and a set of named functions and answers one value per name, and the half of a `Query` that decides which rows is now `Narrowing`, extended by both. A page and a summary of that page are two questions over one set of rows, so there is one declaration of the set and both read it.

Required on the interface rather than optional, which makes it breaking for an adapter written outside this repository and is the reason this is a minor. A port with optional halves is two ports, and a footer whose adapter happened not to aggregate would have failed at its first render instead of at compile time. ADR 0032 records the rest: that an empty set answers null rather than zero, because a zero is a total somebody could print and nobody worked out; that a `Decimal` and a `BigInt` answer a string, neither surviving a double; that what a column admits is read from the IR; and that grouping is deliberately absent, so a reader who finds no series learns it was decided rather than forgotten.

`checkDataAdapter` grew to match and found one straight away: the example adapter summed a boolean and answered the count of the true ones, because `Number(true)` is 1.
