---
"@perchjs/ui": minor
---

Add the column layer to the renderer: `DataTable`, and a column registry.

A column renderer is a function, not a component type, so the flat rendering
PRD 07 §2 calls non-negotiable is enforced by the signature: a function cannot
call a hook. `DataTable` looks a renderer up once per column and calls it once
per cell, which is what keeps a hundred rows from being a hundred mounts.

Sortable headers are buttons, so the keyboard reaches them, and carry
`aria-sort`. An icon cell says "yes" or "no" to a screen reader beside the glyph
it shows everyone else.
