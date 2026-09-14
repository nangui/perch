---
"@perchjs/core": patch
"@perchjs/prisma": patch
"@perchjs/prisma-generator": patch
"@perchjs/nest": patch
"@perchjs/ui": patch
"@perchjs/cli": patch
---

Give every package a README and the words somebody would search for. All six went to the registry with a one-line description and nothing else: no page, no keywords, so a reader who found one could not tell what it was for and a reader looking for it could not find it at all. Each now says what it is, that it is part of Perch and released with the other five, and where the reasoning lives. `files` lists only `dist` and `LICENSE`, which is fine — npm puts the README in the tarball whether it is named or not.
