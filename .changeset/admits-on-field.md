---
"@perchjs/core": patch
---

Move the trust boundary's value rule onto the field.

What a field can hold is the field's own answer — a checkbox holds two values,
a select holds the ones it declared, text holds anything that is text — and
deciding it from `sanitize.ts` meant a chain of `instanceof` that every new
field type had to be added to, with nothing to remind anyone. No behaviour
changes. `Option` moves to its own module, which is what the circular-import
guard asked for once a base class needed it.
