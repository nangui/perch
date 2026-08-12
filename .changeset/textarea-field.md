---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add the `Textarea` field, and enforce a declared length on the server.

The control was already here with no field declaring it and no registry entry
pointing at it. `.maxLength()` and `.minLength()` were declared and never
checked — the number crossed the wire as a hint for the browser and nothing
looked at it again, so a forged request put whatever it liked in a field
declared at 500. Both text fields now carry the limit as a rule, counted in
graphemes on each side of the wire so the footer and the error agree.
