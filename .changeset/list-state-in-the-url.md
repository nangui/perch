---
"@perchjs/ui": minor
---

The list page's address says what is on screen.

Turning a page or changing the order writes it into the query string, so
reloading comes back to the same place and the address can be sent to somebody
else. That is half of the acceptance criterion asking for a shareable,
reloadable list; the other half is filters, which do not exist yet.

Written from the answer rather than the request, and only from the answer the
table accepted. The server caps the paging depth and drops a sort it never
declared, so an address built from what was asked can name a page nobody was
served — and with two requests in flight, the one that lands last is not always
the one the reader is on.

The page size travels with a turn, since an address may carry one and the
server honours it: a request that left it out came back the default size, and
the address then said one thing while the table showed another.

The first page says nothing, because that is what an address with no page
means, and anything else already in the query is left alone.

`replaceState`, not `pushState`: nothing listens for `popstate`, so history
entries would give a Back button that changes the address without redrawing the
table under it.

The server half already worked and now has a test: opening
`/admin/posts?sort=title:asc&page=2` embeds that page rather than the first.
