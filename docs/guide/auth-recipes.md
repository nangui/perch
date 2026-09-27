---
title: Auth recipes
---

# Auth recipes

Perch authenticates nobody. [Users](./users) says why and shows the two things you wire:
your guards, and a `userResolver` that reads whatever they left behind.

This page is the second half of that, for the four systems people actually have. Each
recipe is the same two questions: where does your guard put the principal, and what does
the panel get when it reads it.

## The resolver is synchronous

Read this before the recipes, because it decides all four.

```ts
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

@Injectable()
export class ClaimsUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    return (request as { user?: unknown }).user;
  }
}
```

`resolve` returns a value, not a promise, and nothing awaits it. You cannot load the user
row here. Returning a promise does not fail: it hands every policy, every resolver and
every badge a pending promise instead of a user, and a policy asking `user.role` gets
`undefined` from it rather than an error.

So whatever your guard left on the request is what the panel works with. If a policy
needs a role, the guard has to have put a role there.

## Passport with a JWT

Your guard is the one you already have, and Passport puts its result on `request.user`.
That is where Perch looks by default, so there is nothing to write:

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      guards: [JwtAuthGuard],
    }),
  ],
})
export class AdminModule {}
```

The trap is what `request.user` holds. A JWT strategy's `validate()` returns claims, so
unless yours loads the row, `user` is `{ sub, email, iat, exp }`. A policy written as
`user.role === "admin"` is then comparing `undefined` to a string on every request, which
denies quietly rather than failing loudly.

Either put the role in the token, or have `validate()` return the row. Both are decisions
about your auth, and neither is something the panel can make for you.

## Sessions

The principal is on the session rather than on `request.user`, so the resolver is where
you say so.

```ts
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

@Injectable()
export class SessionUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    const session = (request as { session?: { account?: unknown } }).session;
    // A session exists for anybody who ever loaded a page, signed in or not.
    // Returning the empty one gives every policy an object to read `role` off,
    // and `undefined !== "admin"` denies without ever saying why.
    return session?.account ?? undefined;
  }
}
```

Name it in `forRoot` with `userResolver`, and it is built by the container, so it can
inject whatever it needs.

## Clerk

Clerk's middleware leaves its own shape, keyed by its own identifier.

```ts
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

interface ClerkAuth {
  readonly userId?: string;
  readonly orgRole?: string;
}

@Injectable()
export class ClerkUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    const auth = (request as { auth?: ClerkAuth }).auth;
    if (auth?.userId === undefined) return undefined;
    return { id: auth.userId, role: auth.orgRole };
  }
}
```

The trap here is the identifier. `auth.userId` is a Clerk id, not the primary key of your
own table, so a policy written as `record.authorId === user.id` never matches and every
row is refused. Either the resolver maps the Clerk id to your own, which it cannot do
synchronously, or your guard attaches your row and the resolver reads that.

The workable shape is the second one: resolve the row in the guard, where awaiting is
allowed, and let the panel read what is already there.

## Auth.js

Same shape of problem, different field. An Auth.js session is `{ user: { name, email,
image } }`, and by default it carries no id at all.

```ts
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

interface AuthjsSession {
  readonly user?: { readonly email?: string };
}

@Injectable()
export class AuthjsUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    return (request as { session?: AuthjsSession }).session?.user;
  }
}
```

A panel whose policies compare emails works. A panel whose policies compare ids needs the
id in the session, which is an Auth.js callback rather than anything here.

## The one mistake all four share

The thing your auth left on the request is not your user row, and the panel never checks
that it is. It does not inspect the principal at all: it has no idea whether yours has an
`id`, a `role` or a `tenant`, which is why everything that reads one is a function you
wrote.

So a policy comparing a field the principal does not carry does not fail. It denies, on
every row, for ever, and [a refusal is a 404](./users). Write one policy test before you
write ten policies.

## Cross-site requests

A page on another site can make your reader's browser post to your panel, and the browser
attaches their cookies. Every recipe above authenticates with a cookie, so that request
arrives signed in: your guard lets it through, and the panel sees a reader doing something
they are allowed to do.

The panel refuses it before the route runs. What a form on another page can send is limited
to three content types and no header of its own, so a request that changes something has to
be JSON, or carry `x-perch-panel`, which is what the panel's own client sends on the one
request it makes that cannot be JSON. Anything able to do either is a script, and a script
from another origin is asked for permission first.

The refusal is a 404, like every other refusal here. There is nothing to configure and
nothing to store, and your own client keeps working as long as it posts JSON.

Two things this does not cover.

It says nothing about `GET`. A route that reads changes nothing, which is the assumption
behind leaving it alone, and it holds for the panel's own routes.

And it is one layer. On NestJS 12.1 or later your application can check the origin of every
request before Nest sees it, middleware and all, which is earlier and wider than anything a
panel can do from inside: call `app.enableCsrfProtection({ trustedOrigins: [...] })` on
the
application object, after `NestFactory.create()` and before `listen`. It is not shown
here as
an example because it does not exist on NestJS 11, which this package still supports, so a
block of it would compile against one of the two majors and not the other.

Setting `SameSite` on your session cookie is the other half, and belongs to whoever issues
it.
