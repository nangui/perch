---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add the `Radio` field, and split `inline` in two.

The fields PRD asks for Filament v4's distinction between laying a field's
choices out in a row and putting its label beside the control. They are now two
names: `.inline()` on `Radio` moves the choices, `.inlineLabel()` on every
field moves the label. `Checkbox.inline()` becomes `.inlineLabel()`.

Resolving a declared option list also stopped being one class's privilege — a
second field declaring `.options()` had them silently never resolved.
