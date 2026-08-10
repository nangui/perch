---
"@perchjs/nest": minor
---

`redirectAfterCreate` accepts `"index"`.

PRD 05 §3.2 names three targets — index, view, edit — and only `edit` existed,
because the list page did not. It does now, so a create can land back on the
table it was started from. Declared on the panel or overridden per resource,
like the other two.
