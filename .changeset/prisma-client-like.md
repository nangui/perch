---
"@perchjs/prisma": minor
---

Let a Prisma client satisfy `PrismaClientLike`, which until now it could not. The interface asked for an index signature over the delegates as well as `$transaction`, and TypeScript gives an object literal an implicit index signature and never gives a class one. A Prisma client is a class, so the only thing the interface exists to describe was the one thing that could not be assigned to it. Both integration suites in this repository got past it with `client as never`, and the installation guide documents a three-line subclass that would not have compiled for anybody following it. The interface now asks for the one method it needs; looking a delegate up by name was always this file's own business and is done there.
