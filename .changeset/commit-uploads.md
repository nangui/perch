---
"@perchjs/nest": minor
---

Commit staged files on save, before the row is written.

The order is ADR 0016's: a save moves the attachment out of staging, then
writes the row, so a failure between them leaves a file nobody points at rather
than a row pointing at nothing. A write that throws takes its committed files
with it, and an attachment the row has replaced is dropped only once the row has
stopped pointing at it.
