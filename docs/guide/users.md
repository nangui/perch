---
title: Users
---

# Users

Perch authenticates nobody, and that is the design rather than a gap.

Laravel has one canonical auth system, so Filament can provide a login page. Node has a
dozen: Passport, JWT, sessions, Clerk, Auth.js. Providing ours would conflict with the one
you already have in every application that has one.

What the panel provides is a place to plug yours in.

## Your guards, every route

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      // Yours. They stand between the panel and the internet.
      guards: [JwtAuthGuard],
    }),
  ],
})
export class AppModule {}
```

They apply to every panel route: the pages, the assets and the API. There is no route that
skips them, and no second login.

## Who the panel thinks is asking

Whatever your guards leave on the request. By default that is `request.user`, which is
where Passport and most Nest guards put it.

```ts
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

@Injectable()
export class SessionUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    return (request as { session?: { account?: unknown } }).session?.account;
  }
}
```

Name it in `forRoot` with `userResolver` and it is built by the container, so it can
inject whatever it needs. Whatever it returns reaches every resolver, every policy, every
badge and the user menu, as `user`.

The panel never inspects it. It has no idea whether your principal has an `id`, a `role`
or a `tenant`, which is why everything that reads one is a function you wrote.

## Policies

```ts
import type { Authorization } from "@perchjs/nest";
import { PanelResource } from "@perchjs/nest";
import { Schema, TextInput } from "@perchjs/core";

interface User {
  readonly id: number;
  readonly role: string;
}

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  can: Authorization = {
    viewAny: (user) => (user as User).role !== "guest",
    view: (user, record) => (record as { authorId: number }).authorId === (user as User).id,
    create: (user) => (user as User).role === "editor",
    update: (user, record) => (record as { authorId: number }).authorId === (user as User).id,
    delete: (user) => (user as User).role === "admin",
  };

  form() {
    return Schema.make([TextInput.make("title")]);
  }
}
```

Absent means allowed. The panel already sits behind your guards, and requiring a policy on
every resource would mean writing `() => true` a great many times. It is a debatable
default, so it is written down rather than assumed.

Name the type, as above. A misspelled key is otherwise a rule nobody calls, which leaves
the resource more permissive than whoever wrote it believes.

## A refusal is a 404

Never a 403.

Telling the two apart is how somebody maps what exists. A 403 says "this is here and you
may not have it", and a caller who collects those has learnt your schema one address at a
time. So a resource that is forbidden and a resource that does not exist answer the same
thing.

A check that cannot be evaluated is a refusal too. Skipping a declared `view` because the
record has not loaded yet would be authorising at render time, which is the one thing
authorisation may not do.

## Both halves, every time

A `viewAny` refusal removes the navigation entry **and** protects the routes.

Neither alone is a protection. A hidden link with an open route is a URL somebody types; a
closed route with a visible link is a button that fails. The same rule governs actions: a
policy that hides a button is asked again when the action runs, per record.

## Saying who is signed in

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

interface User {
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      userMenu: {
        name: (user) => (user as User).name,
        description: (user) => (user as User).email,
        items: [
          { label: "Profile", href: "/me", icon: "user" },
          { label: "Sign out", href: "/auth/logout" },
          {
            label: "Admin",
            href: "/admin-tools",
            visible: (user) => (user as User).role === "admin",
          },
        ],
      },
    }),
  ],
})
export class AppModule {}
```

Both halves are declared because the panel cannot guess either. It does not know that your
principal has a `name`, and signing out is a route you wrote, not one it owns.

Built per request, like the navigation beside it and for the same reason: two readers are
two menus, and one kept across them is one reader's menu shown to another.

An item this reader may not have is dropped **on the server**. Hiding it in the browser
would mean it had already been sent. Every address goes through the same check the row
actions and the breadcrumb go through, because `javascript:` in an `href` is the same hole
wherever the string came from.

Returning no name means no menu at all, rather than one headed by a blank that says
somebody is signed in without saying who.
