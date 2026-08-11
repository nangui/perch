---
"@perchjs/ui": minor
---

Give a searchable Select a search box.

Radix's `Select` owns the keyboard inside its own content, so a text input
there receives half of what is typed. The searchable variant is a combobox
built on `Popover`: focus stays in the box, the active option is named by
`aria-activedescendant`, and the searching happens on the server.
