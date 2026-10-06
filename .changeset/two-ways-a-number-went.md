---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add `trending-up` and `trending-down` to the icons the panel draws. A card says something about a number beside it, and a trend is the first thing PRD 09's own stats example reaches for: it writes `descriptionIcon(change >= 0 ? 'trending-up' : 'trending-down')`, and neither existed. Nothing close to them did either, the set carrying a chevron for down, left and right and none for up.

Two, not one. A panel that drew only the rise would be a panel with an opinion about which direction is worth an arrow.

Additive, which is what ADR 0030 says a closed vocabulary does: the set grows and nothing leaves it, so a name that worked still works. And `Record<IconName, ReactNode>` is what makes it one decision rather than two: a name added without its drawing stops the compiler rather than drawing nothing on a screen with nothing to say a declaration had been ignored.
