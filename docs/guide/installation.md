---
title: Installation
---

# Installation

Perch goes into an application you already have. It authenticates nobody, owns no
database connection and replaces none of your routing — it mounts under a path you
choose and reads the Prisma schema you already wrote.

## What you need

- Node 22 or later
- A NestJS 11 application, on Express
- Prisma 7 with a PostgreSQL datasource

Those are the versions v0.1 supports, and the `DataAdapter` port exists so that others
become possible later. Nothing in the framework reaches past it.

## Install

```sh
pnpm add @perchjs/core @perchjs/nest @perchjs/prisma
pnpm add -D @perchjs/prisma-generator @perchjs/cli
```

Three at runtime, and `@perchjs/core` is there because your own resources import
from it — a package you import is a package you declare. `@perchjs/ui` is not in
the list: the panel serves it, `@perchjs/nest` depends on it, and nothing you
write ever imports it.

## Generate the intermediate representation

Perch does not read your database at runtime to find out what a model looks like. It
reads what the generator wrote while `prisma generate` ran — the columns, their types,
the relations, the unique constraints — so that a panel starting up knows the shape of
everything before it serves anything.

Add the generator to `schema.prisma`:

```prisma
generator perch {
  provider = "perch-prisma-generator"
  output   = "../src/panel/.generated"
}
```

Then:

```sh
npx prisma generate
```

## Wire it up

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { PrismaDataAdapter } from "@perchjs/prisma";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: PrismaDataAdapter,
    }),
  ],
})
export class AppModule {}
```

The panel is at `/admin`. Every route under it — the pages, the assets and the four
protocol routes — is registered by the module; you write none of them.

## Or let the CLI do it

```sh
npx perch panel
npx perch resource Person
```

The first writes the module and registers it. The second reads a model out of the
generated representation and writes a resource whose form and table match its columns —
a file that compiles, passes your lint and runs without editing.

## Putting it behind your own auth

Perch provides no login page, and that is deliberate: Laravel has one canonical auth
system and Node has a dozen. Providing ours would conflict with the one you already have
in every application that has one.

Instead, the guards you pass apply to every panel route, and the principal they leave
behind reaches every resolver and every policy:

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { PrismaDataAdapter } from "@perchjs/prisma";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: PrismaDataAdapter,
      // Yours. Whatever they leave on the request is what a policy is asked about.
      guards: [JwtAuthGuard],
    }),
  ],
})
export class AppModule {}
```
