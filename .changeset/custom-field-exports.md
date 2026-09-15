---
"@perchjs/core": minor
---

Export `ValueRefusal` and `isUnset`, which a field of your own cannot do without. `admits` returns a `ValueRefusal` and the type was internal, so an outside field had to spell the union out; `isUnset` is the framework's own test for "nothing at all", and writing `undefined`, `null` and the empty string by hand instead is how a custom field comes to disagree with every other one about what empty means. Neither blocked anything, which is why neither had been noticed — both were found by compiling the documented example for writing a field, which until now could not have been copied.
