---
title: Introduction
---

# Perch

You declare a resource in TypeScript and get a complete admin panel. You never write
a front end.

That is the whole idea, and everything in this documentation is a consequence of it.
A resource says which Prisma model it is about, what its form holds and what its table
shows; the panel serves the pages, resolves the state, checks the permissions and draws
the screens.

```ts
import { Schema, Select, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person", slug: "people" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("name").required(),
      Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
      // Shown only once a country has been answered, and the panel decides that
      // — on the server, where the rule was written.
      Select.make("cityId")
        .options(({ get }): Record<string, string> =>
          get("countryId") === "fr" ? { paris: "Paris" } : {},
        )
        .visible(({ get }) => Boolean(get("countryId"))),
    ]);
  }

  table() {
    return Table.make().columns([TextColumn.make("name").label("Name")]);
  }
}
```

## What you are not writing

No React. No route file. No fetch. No form state. The dependent `Select` above takes a
round trip to the server and comes back resolved, and nothing in the browser was told how
to do that.

## The one rule worth knowing first

**The state is authoritative on the server.** When a field decides whether another is
visible, or what options it offers, that decision is made where the rule was written.
The browser is an interpreter: it draws what it is given and sends back what was typed.

This is not a performance trade-off that was lost — it is what makes the rest possible.
A condition evaluated in the browser is a condition an attacker can answer differently,
and a panel where a hidden field can be saved by hand is not an admin panel, it is a form
with decoration.

## Where to go next

- **[Installation](/installation)** — putting a panel into an existing NestJS application.
- **[How the pieces fit](/how-it-fits)** — what each package does, and what happens on a
  round trip.

## Status

Perch is in implementation. The four acceptance milestones pass, the packages are
published together under one version, and the documentation is being written alongside.
Every TypeScript example on this site is extracted and compiled against what the packages
publish, so an example that stopped being true fails the build rather than you.
