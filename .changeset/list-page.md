---
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Add the list page: `GET {path}/:resource`.

It serves the panel shell with the first page of records already embedded, so
nothing is fetched twice, and mounts `PanelList` rather than a form. Clicking a
sortable header asks `/records` for that order instead of reordering what the
browser holds — the server stays authoritative, and a client cannot sort past
the page it has.

The rules the API route applies are now applied once, in `records.ts`, which
both callers use: who may list, which sorts are accepted, which columns leave
the server.
