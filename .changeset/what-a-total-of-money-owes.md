---
"@perchjs/testing": minor
---

Ask an adapter what a total of money owes. Where the model carries a `Decimal` column and the rows written into it hold values there, `checkDataAdapter` now asks for a sum of it and holds two things: that it comes back as a string, a double being unable to hold the value the database computed, and that it matches the rows to the last unit of the column's own scale.

Compared in that smallest unit rather than as a float, which is exact arithmetic on integers instead of a second rounding to argue about. The scale comes from the schema, so it is the column's precision and not a guess at it. Narrowed to the rows the contract wrote, by key, because a total over the whole table would be summing whatever earlier runs left behind.

An adapter rounding quietly is the one failure nobody notices until an invoice is wrong, and it is the one an adapter passes every other check in this contract while committing.
