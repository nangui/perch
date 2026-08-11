---
"@perchjs/ui": minor
---

The list page can be turned.

Previous and next appear once there is more than one page, and nothing appears
when everything fits on one. Turning a page is a round trip: the client cannot
see past the rows it holds, which is the same reason sorting is one.

The page on screen is the server's answer, never what was clicked. Advancing a
counter locally would show page 4 after the server had capped the request and
served page 3.

Reordering starts over at page 1 — page 5 of one order is not page 5 of
another — and turning keeps the order it is in.

Two requests can be in flight — Next then Previous — and only the one the
table is waiting on is allowed to land. Whichever the network hands back last
would otherwise win, including the page the reader has already moved on from.
A refusal nobody is waiting on raises no alarm either.

The count line carries the page as well, and stays the only live region on the
page: the rows change under a screen reader without announcing themselves, so
one sentence says a turn happened rather than two talking over each other.

A per-page selector and the page in the URL are not here. The second belongs
with sorting, which is not in the URL either, and doing one without the other
would make reloading restore half the state.
