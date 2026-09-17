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

An explicit list is the recommended way. It is predictable, it survives a bundler, and it
makes the set of resources something you can read rather than something you have to run
the application to find out.

## Or found in a folder

For a codebase where adding a resource should not also mean editing a module:

```ts
import { Module } from "@nestjs/common";
import { discoverResources, PanelModule } from "@perchjs/nest";

const resources = await discoverResources({ in: "dist/**/*.resource.js" });

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources,
      dataAdapter: AppDataAdapter,
    }),
  ],
})
export class AdminModule {}
```

### Point it at what is on disk when the panel starts

This is the mistake everybody makes once, including the example that first described this
feature. `src/**/*.resource.ts` is where you wrote them; your application is running the
JavaScript built from them, and those files are not there any more.

Rather than finding nothing and serving a panel with no resources, it refuses, and the
message says this is probably why. It says the same thing when the sources are still
there to be matched, which is what happens when you run from the project root: the
pattern is not empty, the file will not load, and the reason is the same one.

### A bundler leaves nothing to find

The other half of the same question. `nest build` runs `tsc` and writes one file per
module, so `dist/**/*.resource.js` matches what you expect. A bundler collapses the whole
application into one file, and a folder scan over that finds nothing at all.

If you bundle, list your resources. That is the recommended way anyway, and it is the one
that survives a bundler by construction, because a name in an array is a reference a
bundler can follow.

### It is awaited, which the runtime decides

Finding the files is a synchronous question. Loading a module is not one an ESM runtime
will answer synchronously, so `discoverResources` returns a promise and you wait for it
where the module is declared.

### Both, if you like

Listing and finding are two ways of naming the same thing, and a class named by both is
one resource rather than two fighting over a URL:

```ts
import { discoverResources } from "@perchjs/nest";

const found = await discoverResources({ in: "dist/**/*.resource.js" });
export const resources = [PostResource, ...found];
```

A file the pattern matches that exports no resource is refused too. A pattern saying
`*.resource.js` is a claim about what those files are, and a file that quietly is not one
is a resource missing from the panel with nothing anywhere to say so.

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
