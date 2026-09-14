---
"@perchjs/core": patch
"@perchjs/prisma": patch
"@perchjs/prisma-generator": patch
"@perchjs/nest": patch
"@perchjs/ui": patch
"@perchjs/cli": patch
---

Send each package's npm page to its own page rather than to the monorepo's front door. `repository` carries a `directory`, and npm ignores it when it derives a homepage: all six landed on the root README, where a reader looking at `@perchjs/prisma` has to find it among the others. Each names its own now.
