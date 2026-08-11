---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Load the options a `Select.relationship()` declares.

The declaration existed and nothing acted on it: a relationship select resolved
to no options at all, and the reader was handed a dropdown they could not
choose from. Core says what it needs — a relation, a label field, a cap — and
the caller, which holds the IR and an adapter, answers.
