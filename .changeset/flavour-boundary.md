---
"@perchjs/core": minor
---

Refuse a value that is not the shape a text field said it holds. `.email()`, `.url()`, `.numeric()`, `.tel()` and `.password()` are shapes, and until now the boundary took any scalar for all of them: `true` reached a column the form said held an address, and only a validation rule stood in the way. It is refused at the boundary now and discarded in silence, the way every other shape violation is, with nothing said back to whoever sent it. A field that declared no flavour still takes any scalar, which is not laziness but the definition of a field with no shape of its own.

**This changes what boots.** A `TextInputColumn` over a flavoured field is refused from here on, because the column reads exactly this to decide whether a field has a shape of its own. A table editing an email in a cell needs the field to declare no flavour, or the column to go. The rules that catch text which is text and not an address are unchanged and still run.
