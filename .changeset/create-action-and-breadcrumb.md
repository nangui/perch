---
"@perchjs/core": minor
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Add `CreateAction` and the trail back to the list.

`Table.make().headerActions([CreateAction.make()])` renders a link above the
table, as PRD 07 §3 declares it. The form pages carry a breadcrumb back to their
list, which PRD 03 §4.2 puts in the v0.1 chrome.

`editPath` is now `resourcePath`: it addresses the create page and the
breadcrumb as well as a row's edit page. All three go through one origin guard,
so a panel reached at `//evil.com/...` offers no link off the site.
