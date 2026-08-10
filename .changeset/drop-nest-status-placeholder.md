---
"@perchjs/nest": patch
---

Remove `PERCH_NEST_STATUS`.

It was a placeholder export, so the package had one before it had any code, and
it read `"pre-implementation"` while the package carried `PanelModule`, four
controllers, the guards and the resource registry. Nothing imported it.
