---
title: Upgrade
---

# Upgrade

Every `@perchjs/*` package carries the same version number and they are released together,
so an upgrade is one command rather than seven decisions.

```bash
pnpm up "@perchjs/*@0.3.0"
```

**Before 1.0, the minor is the breaking one.** npm reads `^0.2.0` as `>=0.2.0 <0.3.0`, so a
release that asks something of you cannot arrive under an install you already ran. That is
why the tiers land on minors, and it is the reason this page is short: the breaking changes
are collected at the boundary rather than dripped through patches.

This page starts at `0.2`. Going from `0.1` to `0.2` added things and took nothing away,
so there was nothing to do, and a section saying so would be a section about nothing.

## 0.2 to 0.3

Two things to change, and both of them the compiler cannot see. One stops the boot, loudly
and by name, which is how you will find out. The other changes what a page draws.

### A resource that offers `ViewAction` has to say how a record reads

`ViewAction` is a link to the record's View page, and that page is the resource's infolist.
A resource that offered the button without declaring one drew a button that answered 404.
Nothing said so: the list looked right, and the reader found out by pressing it.

The boot now refuses it, naming the resource and the action. The same refusal already
applied to `ViewAction.make().inModal()`, which had nothing to open; the link form was let
through on the grounds that its 404 said the same thing. It says it to the one person who
cannot act on it.

If a resource of yours stops booting with a complaint about an `infolist()`, it is this.
Declare one:

```ts
import { Schema, Table, TextColumn, TextEntry, TextInput, ViewAction } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  infolist() {
    return Schema.make([TextEntry.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([ViewAction.make()]);
  }
}
```

Or drop the action, if a record of that resource is not meant to be read on its own.
Nothing else offers the page, so nothing else has to change.

A relation manager is unaffected. A link in one was already refused, a child having no page
of its own at all.

### An entry with no name of its own now borrows its path

`TextEntry.make("family")` used to draw its value with nothing beside it, while
`TextInput.make("family")` drew `FAMILY` above the box. The same declaration, read two ways.
An entry now falls back to the path it reads, which is what a field in the same position
already did and what a column already did in its heading.

Most pages get better and need no edit. Two cases are worth a look.

An entry you left unnamed on purpose now has a name. Say so explicitly and it stays as it
was:

```ts
import { TextEntry } from "@perchjs/core";

export const quiet = TextEntry.make("headline").label("");
```

An empty string is a name you chose, not the absence of one, so the fallback leaves it
alone.

An entry that reads through a relation shows the path as written, `customer.email` and not
`Email`. That was already true of a field and of a column heading, and the answer is the
same in all three: give it a label.

`RepeatableEntry` is unaffected. Its label is the heading of a group rather than the name of
a value, and nothing that groups invents a heading out of a path.

### Date ranges in the filter bar

No action. A `DateRangeFilter` now takes two cells of the bar instead of one, and its two
boxes sit at their own width inside them. Sharing a single cell squeezed each box under
what a native date control needs, so the browser clipped it and took the calendar button
off the end.
