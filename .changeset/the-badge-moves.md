---
"@perchjs/ui": patch
---

Move the badge into the styling config.

Five rules and thirty-four lines: the pill and its four tones. The smallest surface left, and the first with nothing entangled in it — no zero-specificity floor deferring to it, no surface it overrides, nothing reaching into it. Five of five selectors identical in their property sets.

Its radius is a spacing step rather than a radius token, which is what it always was: a pill this small wants the tightest round in the scale and the radius scale starts larger. Written as the property it names rather than through a token, because reading it from `radii` would be a lie about which scale the value came from.

**One guard needed both halves, and the prediction that it would not was wrong.** `rendered.test.ts` asks that every tone has a rule as a pill and as words. The pills are generated now and the tone attributes are not, so the two halves of that one claim live in different files — and either half alone passes by finding one of them. Probed by removing a tone: it names `badge:warning`.
