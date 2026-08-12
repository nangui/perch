---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Refuse a form that cannot work, at boot.

A fluent builder cannot judge its own chain: `.searchable()` before
`.relationship()` and after it are the same field, and a method that throws
sees only what was written before it. Every declared form and table is now read
once, on the finished tree, and a field or filter that promises what it cannot
do stops the boot naming itself.
