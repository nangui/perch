---
"@perchjs/ui": patch
---

Refuse a hand-written rule where a recipe already draws.

While the stylesheet is being moved into the styling config a surface at a time, the two sheets coexist — and they are not equal. The generated one puts its rules in cascade layers; the hand-written one puts them in no layer at all, and unlayered styles beat every layer. Not by specificity, not by order: by the cascade itself.

Measured on the served sheet rather than reasoned about: the recipes sit inside `@layer recipes.slots`, which closes at byte 8069, and the hand-written rules begin at 9796.

So a surface converted without deleting the rules it replaced *looks* converted. The recipe is in the sheet, the markup carries its classes, and every declaration still renders from the old rule. Nothing fails, nothing warns, and the only sign is that the change had no effect. That is now a test rather than a thing to remember, probed by leaving one rule behind: it names the class and says why.
