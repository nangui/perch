---
"@perchjs/testing": minor
---

Ask an adapter whether its rows can be sent at all. `checkDataAdapter` now puts every row it has in hand through `JSON.stringify`, from `create`, from `findOne` and from a page, because a panel does exactly that on every route that shows one. An adapter answering a value that throws there takes down every page drawing that column, with a stack trace about JSON and nothing naming the declaration that caused it.

Two halves, and the first needs nothing declared. It judges the rows that actually came back, so it catches any unserialisable value from any adapter against any schema. The second is about the column rather than today's rows: where the model carries one the schema calls `BigInt`, that column may not come back as a `bigint`, a string being what keeps every digit a number would lose. That half can only ask where such a column exists.

Both are held by adapters that bend the conforming double: one hands back a bigint from a page, one from a write where no page would have shown it.
