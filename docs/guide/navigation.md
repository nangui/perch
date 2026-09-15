---
title: Navigation
---

# Navigation

The menu is built from the resources, on every request, for the reader making it.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({
  model: "Order",
  navigationGroup: "Commerce",
  navigationSort: 10,
  icon: "tag",
})
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }
}
```

Nothing is registered by hand. A resource that exists is in the menu, unless its policy
says this reader may not reach it.

## Rebuilt per request

Not once at boot. Two readers see two different panels, and a menu cached across them
would be one reader's menu shown to another.

That is also what makes the badge below possible, and what makes a policy change take
effect on the next page rather than the next deployment.

## Order

Two rules, both of which exist so that an order nobody stated is still stable.

**Within a group**, `navigationSort` decides, and where two resources share a number their
plural labels break the tie alphabetically.

**Between groups**, the ones the panel declared come first, in the order it declared them.
A group a resource names and the panel did not still appears, after those, alphabetically.

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      navigationGroups: ["Commerce", "People", "System"],
    }),
  ],
})
export class AppModule {}
```

Resources in no group come **first**, before every declared group. That is deliberate: the
handful of things somebody opens every day rarely belong in a category, and putting them
under one called "General" is a heading that carries no information.

## A count beside the name

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Order", navigationGroup: "Commerce" })
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  async navigationBadge(user: unknown): Promise<string | undefined> {
    const pending = await countPending(user);
    return pending === 0 ? undefined : String(pending);
  }
}
```

It is handed the principal, for the same reason the policy is: a count of rows this reader
may not see is a fact about them, one digit at a time.

Answering `undefined` draws nothing, which is what an empty queue should look like. A
resource this reader cannot reach is never asked at all, so a badge cannot leak the
existence of something the menu is already hiding.

A badge is a query on every page load. Count something cheap, or cache it yourself.

## Marks

`icon` takes a name from the panel's own set, and one it cannot draw stops the boot.

The set is closed on purpose. A mark on a tab and a mark on a menu entry are the same
drawing at the same weight whoever declared them, which is what a character in a string
could never promise: a glyph is whatever the reader's font decided, at a size nobody chose,
and an emoji carries colours no theme can reach.

## Custom pages

A page with a schema and no model behind it takes the same three options, and sits in the
menu beside the resources.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelPage } from "@perchjs/nest";

@PanelPage({
  path: "settings",
  label: "Settings",
  navigationGroup: "System",
  navigationSort: 99,
  icon: "cog",
})
export class SettingsPage implements PanelPage {
  schema() {
    return Schema.make([TextInput.make("title")]);
  }
}
```

Pages come after the resources inside whatever group each named, and the same refusal
removes them: one this reader may not reach is not drawn and does not answer.

## What is not in the menu

A page about one record. Statistics for this order, the audit trail of this post: those
live under the record's own address and are reached from a strip of links the record
carries, because a page about one row is not a place anybody navigates to cold.
