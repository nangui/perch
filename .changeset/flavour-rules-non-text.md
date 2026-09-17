---
"@perchjs/core": minor
---

Refuse a value that is not text where a text field said what it holds. `.email()`, `.url()` and `.numeric()` each began by letting past anything that was not a string, which was written to leave emptiness to `required` and let far more than emptiness through: `true` went into a column the form said held an address, because a rule about what an address looks like never asked about values that are not words. The boundary does not catch it and is right not to, since it judges shape and a boolean is a scalar like any other, which is what lets a text field hold whatever a text field holds. So the rules ask now. Emptiness still belongs to `required`, spaces included, and `.numeric()` still takes a number as readily as the string a browser sends.
