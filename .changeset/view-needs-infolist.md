---
"@perchjs/nest": minor
---

Refuse a View that leads to a page the resource does not draw. A `ViewAction` left as a link navigates to the record's View page, and that page is the resource's infolist; without one the route answers 404, correctly, because there is nothing for it to draw. The boot already refused the same action asked to open in a dialog, and let the link through on the grounds that its 404 said the same thing to the reader. It does not say it to anybody who can act on it: the button is on the reader's screen in both cases, and the person who can fix it is the one who wrote the list. Row actions only, a link inside a relation manager being refused whole already. This is breaking under the rule that a minor before 1.0 is breaking: a resource that offers View without an `infolist()` booted yesterday and does not today, which is the point of the change.
