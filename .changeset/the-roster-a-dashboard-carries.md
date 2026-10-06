---
"@perchjs/nest": minor
"@perchjs/ui": minor
---

Draw a dashboard: a page names the widgets it holds, the shell sends the roster, and each card fetches its own numbers.

This is the half that was missing. A widget could already be declared, registered and asked for by name, but nothing sent a browser the list — so the route answered and no page ever called it.

A page says which cards it holds, in the decorator:

```ts
@PanelPage({ path: "dashboard", widgets: ["visits", "signups"] })
```

Statically, so a name no widget claims stops the boot with the registered names printed beside it rather than drawing a page with a gap in it. The module's `widgets` list and this one are different lists on purpose: that one registers what exists so the container can build it, this one places what a screen shows, and the boot checks the second only ever names the first.

**The order is the widget's, not the page's.** `sort` is declared on the widget because placement is the widget's business, so a page may name its cards in any order and they appear where they belong among the rest.

**The roster carries places and addresses, and no numbers.** Each card's `href` is built on the server from the request, because a panel under a global prefix is a panel whose addresses a browser could not have worked out. So the grid is on screen before a single aggregate has run, and a dashboard of eight heavy ones draws at once and fills in.

**One request and one piece of state per card**, which is what makes a failure local by construction rather than by anybody remembering to catch it in the right place: the slow card is slow alone, and the broken one shows a line and a Try again in its own box while the others fill in.

**A card this reader may not have leaves no trace on the page.** Narrowed in the roster as well as on the route, because neither alone is enough: a roster that lists it tells them it exists and what it is called, and a roster that omits it is no protection while the route is still there to be asked. A page whose every card is refused gets no grid at all, which is the same thing a page holding no card gets.

The cards themselves read their values where the locale is, and fall back to the digits rather than breaking when they cannot: a currency code that is not one, a fraction count Intl will not take, and a decimal that arrived as text because it would not survive a double. An empty aggregate reads as a dash and never as a nought.

It costs the main bundle 0.68 kB gzip.
