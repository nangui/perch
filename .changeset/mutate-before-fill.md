---
"@perchjs/nest": minor
---

Add `mutateFormDataBeforeFill`, the third of the shaping hooks and the one that runs the other way. The two that exist are the last thing to touch what is written; this is the first thing to touch what is shown, for where a stored shape and an edited shape stop agreeing: a column holding minutes and a field asking for hours. A form's `default` cannot do it, since `default` is for a row that does not exist yet. What it returns fills the form and nothing else: it is handed a copy, so the record the policies and the relation managers read is untouched, and only the paths the tree makes visible are serialised, so it is not a way to put a column on a page the form does not carry. Asked on an Edit page alone, a create having no row to read.
