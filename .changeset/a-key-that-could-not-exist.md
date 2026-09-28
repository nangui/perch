---
"@perchjs/testing": patch
---

Ask `findOne` for a key shaped like the ones the model really has. The contract checks that an adapter answers nothing for a key that was never there, and it asked with a string. A model keyed on an integer refuses that before the adapter can answer, so the check reported every adapter that validates its input as raising, and every adapter that does not as fine — the exact inverse of what it meant to say. The key is now shaped like the ones the rows came back with. Found by running the contract against the adapter that ships rather than against the ones written to exercise it: both of those hold their rows in memory and compare with `===`, where Prisma reads the column's type and says no.
