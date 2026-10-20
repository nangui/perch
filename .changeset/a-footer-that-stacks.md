---
"@perchjs/ui": patch
---

Stack a table's totals on a phone the way its rows already stack.

Below 40rem every row became a card, and the footer was left as it was: still a table's width, with each column that had no total drawn as an empty strip of its own, ruled top and bottom, around the one that did. The footer now stacks, each footer row is a card on `surface-sunken`, an empty cell is not drawn, and a total is named by its column like a body cell, `Salary … Total 58 300,00 €`. Footer cells with a summary carry `data-label`.
