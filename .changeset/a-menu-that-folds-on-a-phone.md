---
"@perchjs/ui": patch
---

Fold the panel's menu behind a button on a narrow screen, and let the page reach the window's edge.

**The navigation stacked on a phone again.** The rule that stacks the shell below 40rem set `.perch-shell` to `display: block`, but the topbar had moved the navigation and the page into `.perch-shell__body`, which stayed a flex row. At 390px the menu was a column as wide as its longest link and the page overflowed beside it. `.perch-shell__body` now stacks too.

**Stacked, the menu is folded.** Open above the page, five resources put three hundred pixels of links between a reader and what they opened. Below 40rem the menu is one button naming the page you are on, `.perch-nav__toggle` with `aria-expanded`, and the links sit in `.perch-nav__groups` until it is pressed; `data-open="true"` on `.perch-nav` says it is open. Wider than that nothing changes: the button is not drawn and the list always is. `sidebar.start` hooks draw above the button, `sidebar.end` hooks inside the folded list.

**No frame round the panel.** The shell puts `perch-root` on `<body>`, and nothing reset a body's eight pixels of margin, so the navigation stopped short of every edge of the window. `.perch-root` sets `margin: 0`.
