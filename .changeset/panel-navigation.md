---
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Add the panel navigation.

Built on the server on every request, from the resources the registry holds and
the authorization each declares — PRD 04 §5 requires a `viewAny` refusal to
remove the entry *and* protect the routes, and this is the first half. Rebuilt
per request rather than cached: two users see two different panels.

Groups come from `PanelModule.forRoot({ navigationGroups })` in the order
declared; a group a resource names and the panel does not still appears, after
those and alphabetically. `navigationSort` orders within a group, and the label
breaks a tie.
