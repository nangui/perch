---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Honour `Select.multiple()`.

It was declared, crossed the wire as a prop, and nothing anywhere acted on it:
the field rendered as a single select and persisted one value. A required
multiple select also passed validation with an empty selection, because an
empty array was not blank.

On a relationship it now refuses at declaration rather than saving one of the
several rows you picked. Writing a many-to-many relation comes with its own
change.
