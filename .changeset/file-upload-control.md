---
"@perchjs/ui": minor
---

Give `FileUpload` its control, and the panel a way to send a file.

The reader picks, the bytes go up at once, and what stays in the form is the
key the server issued — so the control has three states rather than two, and
the middle one is why this is not a file input with a label on it. A refusal
carries the server's own words, because it is the one that knows the limit.

The tenth of the ten v0.1 fields.
