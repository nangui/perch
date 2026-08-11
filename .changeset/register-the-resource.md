---
"@perchjs/cli": minor
---

`perch resource` now puts what it writes on the panel.

It adds the class to `resources` in `src/admin/admin.module.ts` and imports it
there, which was the last hand-edit on the way from an empty application to a
working panel: `perch panel`, `perch resource User`, done.

Written without asking, unlike `perch panel`'s edit to the root module — that
one changes a file the developer wrote, this one changes a file Perch wrote and
whose `resources` list exists for exactly this. A module it cannot read without
guessing is left alone with the line to add printed, and a project with no panel
module is told to run `perch panel` rather than silently skipping the step.

`--src` now decides where a generated resource lands, instead of being read for
input and ignored for output.
