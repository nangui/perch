---
"@perchjs/core": minor
"@perchjs/prisma-generator": patch
---

Keep the soft-delete tombstone out of inferred forms.

On a model that soft-deletes, `deletedAt` was offered as an ordinary date field:
a picker that deletes the row. `inferModel` now returns it with
`excludedFromForm: "soft-delete"` — a reason of its own, since nothing generates
the value and `isReadOnly` would be the wrong word for it. A model whose
configuration says it does not soft-delete keeps the column editable.

The convention is named once, as `SOFT_DELETE_FIELD` in `@perchjs/core`, and the
DMMF reader now uses it instead of repeating the string.
