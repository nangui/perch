---
"@perchjs/nest": minor
---

Provide the staged-file sweep ADR 0016 promised.

`sweepStaged` was a port method nobody called, so the common leftover — a file
chosen and never saved — accumulated without limit while the record said
orphans were bounded. `PanelUploadSweep` is exported for the host to schedule:
a panel does not get to start a timer in a process it does not own.
