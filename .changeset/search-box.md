---
"@perchjs/ui": minor
"@perchjs/nest": minor
---

The list page has a search box, when a search reaches something.

It appears only where the server said a search touches a column: a box that
filters nothing is a promise the panel cannot keep. And it asks the server
rather than filtering the rows it holds, which are one page of many — filtering
here would search the page instead of the table.

A form, not a box that asks on every keystroke. A round trip per letter is what
the design warns about for filters, and the arithmetic is the same here; Enter
submits, which is what a `role="search"` form does without being told.

What it holds is what was typed; what an answer names is what it becomes.
`/records` echoes the term it applied, because that term is capped at 200
characters and a table declaring nothing searchable drops it — a box showing
what was typed over results that ignored it is the client inventing a state.
The two are reconciled on the component, so the field is never remounted and
the focus stays where the reader put it.

A new term starts over at page one, page five of one result set not being page
five of another, and the term survives a page turn. It goes into the address
too, so a search can be reloaded and shared.
