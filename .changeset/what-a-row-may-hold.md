---
"@perchjs/prisma": patch
---

Stop a `BigInt` column taking the panel down. A row now leaves the adapter with no `bigint` in it: the columns the schema calls `BigInt` arrive as strings, in the row and in the rows of any relation the include plan loaded, from `findMany`, `findOne`, `create` and `update` alike.

`JSON.stringify` refuses a `bigint`, and the panel puts a row through it on every route that shows one, so a table column declared on such a column answered 500 with a TypeError about JSON. The declaration was ordinary and nothing questioned it.

Converted rather than refused: a `BigInt` column is a column somebody has, and a panel that will not show it is a panel that cannot list their table. A string keeps every digit, which is the point, a value past `Number.MAX_SAFE_INTEGER` being exactly what a number loses. Writing back takes either, measured against a real PostgreSQL column, so this is a conversion and not a one-way door.

Named from the schema rather than found by inspecting values: a conversion that recursed into anything object-shaped would turn a `Date` into an empty object and a Decimal into its internals, fixing a crash by breaking two things that worked. A model carrying no such column is handed back untouched, which is almost every model.

ADR 0035 records the rest, including what is left alone: `Bytes` still crosses as an object keyed by index, which is ugly and not a crash.
