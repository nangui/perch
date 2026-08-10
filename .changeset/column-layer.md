---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Add the column layer, and complete `GET /records`.

`Table.make().columns([...])` with `TextColumn` and `IconColumn`, serialised as
PRD 03's `ColumnTree` and returned by `/records`. A resource declares it with
`table()`; one that does not still lists, with no columns.

`.sortable()` is what a sort is checked against. Declaring a table replaces the
narrow default outright — a column that did not ask is refused even if it is the
primary key.
