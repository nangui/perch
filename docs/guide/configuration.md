---
title: Configuration
---

# Configuration

Everything a panel is told, in one call.

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
    }),
  ],
})
export class AppModule {}
```

`path` is the only one that is required. Everything else has a default that is either
honest or absent, and an option that does nothing is not offered at all.

## The options

| | |
|---|---|
| `path` | where the panel is mounted. The only required one |
| `resources` | the resource classes. Listed rather than discovered: predictable, and tree-shakable |
| `pages` | pages with a schema and no model behind them |
| `dataAdapter` | the class that reaches your database. Built by the container |
| `guards` | yours, applied to every panel route |
| `userResolver` | turns the request your guards let through into the `user` everything reads |
| `disks` | the stores a `FileUpload` may name |
| `navigationGroups` | the order the groups appear in |
| `userMenu` | who is signed in, and what they can do about it |
| `redirectAfterCreate` | `"edit"`, `"index"` or `"none"`, for the whole panel |
| `extend` | schema hooks: how a module adds to a form it does not own |
| `imports` | Nest modules whose providers your resources inject |
| `scripts` `styles` | addresses the page should load beside the panel's own |
| `assets` | the panel's own bundle. Resolved for you; passed only by the tests |

## Resources are listed

An explicit list is the recommended way and the only one that exists today. It is
predictable, it survives a bundler, and it makes the set of resources a thing you can read
rather than a thing you have to run the application to find out.

Discovery by folder scan is planned and not written. When it arrives, the list will still
be the recommendation.

## Reaching your database

```ts
import { Injectable } from "@nestjs/common";
import { PrismaDataAdapter } from "@perchjs/prisma";

@Injectable()
export class AppDataAdapter extends PrismaDataAdapter {
  constructor(prisma: PrismaService) {
    super({ client: prisma, ir: IR });
  }
}
```

It takes your client, not one of its own. The panel opens no connection, owns no pool and
never sees your credentials, and the representation is what the generator wrote at build
time.

`dataAdapter` is optional, and a panel without one is a legitimate arrangement: the forms
still resolve, and the routes that need rows answer 404. That is what makes a panel of
custom pages possible without a database at all.

## Injecting your own services

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      // Whatever your resources' resolvers need.
      imports: [CityModule, BillingModule],
    }),
  ],
})
export class AppModule {}
```

Resources are built by the container, which is the whole reason a resolver can call
`this.cities.byCountry(...)` instead of reaching for a global.

## Theming

The bundle ships compiled. There is no build for you to configure, so a theme is a file
that redefines the custom properties the panel declares and is linked after its own
stylesheet, which is what lets it win.

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      styles: ["/theme.css"],
      scripts: ["/plugins/audit.js"],
    }),
  ],
})
export class AppModule {}
```

These are addresses your application already serves. Nothing here fetches them: they
become `link` and `script` tags on the page, and the browser does the rest.

## What is not configurable, and why

**Page size.** A reader picks it and their browser remembers it, so a declared size would
be a number a resource states and a table ignores.

**Date format.** The control shows ISO segments, because a free-text date parsed by locale
is how `03/04` comes to mean two different days on two desks.

**The icon set.** Closed, so that a mark on a tab and a mark on a button are the same
drawing at the same weight whoever declared them. Growing it is a change to the framework,
which is what keeps it one set.

Each of these is a decision rather than a gap. An option that only half works is worse
than an absent one, because the absent one sends you looking for the right answer.
