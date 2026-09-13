---
"@perchjs/core": patch
"@perchjs/prisma": patch
"@perchjs/prisma-generator": patch
"@perchjs/nest": patch
"@perchjs/ui": patch
"@perchjs/cli": patch
---

Point every package at the repository it came from. All six reached the registry with no `repository` field, so their npm pages offer a reader no way back to the source — the root manifest carried one and the published manifests never did. It is also what npm matches a trusted publisher against, and its absence is the likeliest reason that configuring one answered 400 rather than anything about the packages themselves.
