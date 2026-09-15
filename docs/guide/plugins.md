---
title: Plugins
---

# Plugins

A third party can add to a panel it does not own. That is the whole test of whether an
ecosystem is possible, and it is the one thing that cannot be retrofitted: an architecture
that did not plan for extension never becomes extensible, it gets forked.

There is no `Plugin` class yet. What exists is the set of points a plugin would use, and
each of them works today.

## Changing every field of a kind

```ts
import { TextInput } from "@perchjs/core";

// At bootstrap, once. Every TextInput in every panel, from here on.
TextInput.configureUsing((input) => input.maxLength(255));
```

Applied base class first, so the most specific configuration wins. It is bootstrap-time
only: a configurator registered while requests are being served would change what some
readers see and not others.

## Adding to a form you do not own

```ts
import { Schema, Section, TextEntry } from "@perchjs/core";
import type { SchemaHook } from "@perchjs/nest";
import { PanelModule } from "@perchjs/nest";
import { Module } from "@nestjs/common";

const audit: SchemaHook = (resource, schema) =>
  resource.model === "Post"
    ? Schema.make([
        ...schema.children,
        Section.make("Audit").collapsed().schema([TextEntry.make("updatedAt")]),
      ])
    : schema;

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      extend: [audit],
    }),
  ],
})
export class AppModule {}
```

A hook is **a function of a schema, not a mutation of one**. Builders are immutable
everywhere else here, and a hook that reached into a form and changed it would be the one
place a resource could stop meaning what it says.

It sees the resource it is extending, because "add `createdBy` to everything auditable" is
the shape these actually take: an audit module has no list of the resources it is meant to
touch, only a rule for recognising them.

**There is no "injected" form and "native" form.** What a hook returns *is* the form,
read from one place by every route that reads one, because a field one route knows about
and another does not is a field that shows and will not save.

So a hook cannot add a field a reader has no right to see. Not because injected schemas
are filtered too, but because nothing downstream knows there was an injection.

## A component of your own

Two halves, and both are needed. A class on the server that says what the component is and
what it admits, and a renderer in the browser registered under the same key.

```ts
import { registerComponent } from "@perchjs/ui";

registerComponent("StarRating", StarRatingRenderer);
```

Columns have their own registry, because a cell is not a component: one memoised function
per column type is what keeps a table of a thousand cells from being a thousand
components.

```ts
import { registerColumn } from "@perchjs/ui";

registerColumn("Sparkline", (value) => String(value));
```

**An unknown type does not wipe out the page.** A node whose key nothing answers to is
drawn as a placeholder and the rest of the form renders, because a plugin that failed to
load should cost its own corner and not the screen.

## A mark in the chrome

```ts
import { registerRenderHook } from "@perchjs/ui";

registerRenderHook("topbar.end", AuditIndicator, { id: "audit-log", order: 10 });
```

The positions are `shell.start`, `shell.end`, `topbar.start`, `topbar.end`,
`sidebar.start`, `sidebar.end`, `page.start` and `page.end`. An unknown one is refused
where it is registered, because a registration that quietly does nothing leaves its author
with a panel missing their component and no reason for it.

Each hook is drawn behind its own boundary: one that throws loses its own corner and not
the panel, which matters because the panel is where somebody would go to turn it off.

Two plugins at one position come out in declared order, then in registration order, so
that "no order" is still an order rather than whatever the bundler did this time.

## Getting your code into the page

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      scripts: ["/plugins/audit.js"],
      styles: ["/plugins/audit.css"],
    }),
  ],
})
export class AppModule {}
```

Scripts load after the panel's own and as modules, so they run once it has published what
they register against and before it draws anything. A renderer that arrived after the page
was drawn would be a renderer for the next page.

Styles come after the panel's own, which is what lets them win.

## A plugin that ships resources

A plugin providing its own resources and pages is a Nest module like any other. It
declares them, the application imports it, and they are listed in `forRoot` beside the
application's own.

Nothing in `@perchjs/core` knows that plugins exist. An extension point the engine has to
be told about is an extension point the engine got wrong.

## What is not settled

The plugin **API** is not published. There is no `PanelPlugin` interface, no order in
which two plugins modifying one resource apply, and no story for a plugin declaring an
incompatible core version.

Those are v2, deliberately. Publishing early means freezing mistakes, and an extension
point that is used and then broken is worse than one that arrives late. The points above
are stable because each is small and each is already the way the framework's own code does
the same job.
