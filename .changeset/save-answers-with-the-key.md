---
"@perchjs/nest": minor
---

A save answers with the key of the row it wrote, not the whole row.

`POST /api/:resource` and `PATCH /api/:resource/:id` returned every column the
model has, and nothing on the client reads any of them — including, after
`mutateFormDataBeforeCreate` hashes a password, the stored hash. The response
carries the primary key alone, which the redirect already contains.
