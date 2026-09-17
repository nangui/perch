---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Let a text column say how its value reads. `dateTime`, `money` and `numeric` were declarable on an infolist's text entry and not on a table's text column, so the same stored timestamp was a date on a record and an ISO string in the list of them. The demo in this repository showed both. The three are the ones an infolist already had, and they are applied by the same function rather than a second copy of it: breaking it fails the tests on both sides, which is the point of there being one. The rule is declared on the server and applied in the browser, because which wall clock a timestamp is read against is a decision somebody makes once and how a date reads belongs to whoever is looking. A value the rule does not fit is shown as it stands.
