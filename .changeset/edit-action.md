---
"@perchjs/core": minor
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Add `EditAction`, so a row reaches its own edit page.

Declared on the table — `Table.make().actions([EditAction.make()])` — as PRD 07
§3 describes, rather than as a bare link on the row. It renders as an anchor,
because `EditAction` is navigation (PRD 08 §4) and a browser's own affordances
come with saying so.

`/records` now sends the name of the model's primary key and the path its pages
live under, so an address is built from what the server knows rather than from a
convention. A model keyed on `uuid` is addressed by `uuid`, and a panel behind a
host prefix keeps it. The path is withheld when it would not point at this
origin, and then a row offers no action rather than a link off the site.
