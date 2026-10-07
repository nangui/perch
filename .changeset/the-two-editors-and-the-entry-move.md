---
"@perchjs/ui": patch
---

Move the rich editor and the infolist entry into the styling config, and guard two claims that looked guarded and were not.

Forty-nine rules and 332 lines. The rich editor: its frame, the unreadable and waiting states, the toolbar and its buttons, the link row, and the page — which styles the bare elements the document renders to, deliberately matching the markdown preview so moving between the two fields does not move the text. The entry: the value, its four tones, the picture stack, the swatch, the code and link, and the copy button that stays quiet until wanted.

Twenty-four of twenty-six rich selectors and twenty-four of twenty-four entry selectors identical in their property sets, with nothing lost; the differences are the engine's accessible expansion of `outline: none`.

**Probing found two claims nothing was holding, which is the first time a move found that rather than a cascade fault.**

The tone check asked that every tone has a rule "as a pill and as words", and the words half matched any rule carrying `[data-tone]`. Delete an entry's tone and the mark beside it keeps the test green — probed, and it did. It names the entry's own rule now.

And both writing surfaces carry a ceiling with its own scrollbar, each explaining at length why: a surface that grows without one takes its toolbar off the screen, and the rich editor's frame clips rather than scrolls, so anything past the fold could not be reached at all. Nothing asserted either. Deleting the rich editor's left the whole suite green. There is a guard for both now, and it asks for the scrollbar as well as the ceiling — a cap on its own hides the overflow instead of reaching it, which is the fault this replaced rather than a smaller version of it.

Also recorded rather than repaired: `.perch-entry__pictures` declares `flex-wrap` and a gap with no `display` on the element, so both are inert. Carried over exactly as found, with a comment saying so. A port preserves; a suspected fault in what it preserves is reported.

The engine deduplicates across surfaces — the entry's copy button and the repeater's row both quiet their transition under reduced motion, and arrive as one rule with two selectors. Worth knowing when comparing a port against its original: the generated sheet is not a transcription.
