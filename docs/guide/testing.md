---
title: Testing
---

# Testing

Without helpers nobody tests their panel, and a regression in an admin screen is invisible
until somebody's data is wrong.

```sh
pnpm add -D @perchjs/testing @nestjs/testing
```

`@nestjs/testing` is a peer dependency and does not come with an ordinary Nest install.
The harness boots your module through it, which is also why nothing here has to know how
your application is wired.

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

await panel
  .resource(UserResource)
  .form()
  .assertHasField("email")
  .fill({ countryId: "fr" })
  .assertFieldVisible("cityId")
  .fill({ email: "ada@example.com", cityId: "paris" })
  .submit()
  .assertNoErrors();

await panel.close();
```

## It drives the panel, it does not inspect it

Everything goes over HTTP, through the panel's own routes.

Calling a controller directly would skip the serialisation, the guards and the trust
boundary, which is to say it would skip the three places a panel is most likely to be
wrong. A test that passes by not going through them proves nothing about what a reader
gets.

The chain starts where a browser starts, at the page: the first tree travels in the HTML,
and `/state` answers a *change*. A harness that posted a blank state to it would be asking
the panel a question its own client never asks.

## Who is asking

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

// A different reader, and the same panel.
await panel.as(guest).resource(UserResource).assertForbidden();
await panel.resource(UserResource).assertAllowed();

await panel.close();
```

`as()` mints a new facade rather than setting a current user, and the principal travels on
each request. A harness that kept a current user and changed it between calls would be the
shared mutable state this framework refuses everywhere else: two chains in flight and one
reads the other's reader.

`assertForbidden()` asks two doors, the list page and the create page, because the panel
answers the same thing for a resource that is forbidden, one that does not exist, and one
whose list it cannot serve. One shut and the other open is reported as what it is rather
than read as a permission.

## Forms

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

await panel
  .resource(UserResource)
  .form()
  .assertFieldHidden("cityId")
  .fill({ countryId: "fr" })
  .assertFieldVisible("cityId")
  .assertFieldOptions("cityId", ["Paris", "Lyon"])
  .fill({ email: "ada@example.com" })
  .submit()
  .assertNoErrors()
  .assertRecordCreated({ email: "ada@example.com" });

await panel.close();
```

`fill()` is a round trip. It sends the state and takes back whatever the server made of
it, which is the only thing that makes `assertFieldVisible` mean anything: a helper that
decided visibility itself would be a second implementation of the resolution cycle.

`assertRecordCreated()` reads the row back through the edit page rather than off the save.
A save answers with the key and nothing else, on purpose: a form that hashes a password
writes it under the field's own name, and a save that handed the row back would hand the
hash to the browser that supplied the plaintext.

## Tables

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

await panel
  .resource(PostResource)
  .table()
  .assertCanSeeRecords([ada, grace])
  .filter("status", "live")
  .assertCanSeeRecords([ada])
  .assertTotal(1)
  .assertQueryCount(2);

await panel.close();
```

`filter()` refuses out loud when the table declared no such filter. The boundary drops an
undeclared one in silence, which is correct, and a test that believed it had filtered
would assert against every row and pass.

`assertQueryCount()` is the N+1 guardrail, and the one assertion here that does not go
through a route: how many times the panel went to the database is not a thing a browser
can see. A table that fetches a relation one row at a time looks perfectly correct on
screen and costs one query per row.

## Actions

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

await panel
  .resource(PostResource)
  .action("archive", post)
  .assertVisible()
  .call({ reason: "obsolete" })
  .assertProcessed(1)
  .assertNotification("success", "Post archived");

await panel.close();
```

`assertVisible()` and `assertRefused()` are two questions, not one. An action can be drawn
and still refused, because a hidden button was never the protection, so the chain says
what the table offers and what the server did about it separately.

A row action and a bulk action are the same route: `action("archive", one, two, three)`
names as many records as you like.

## A chain runs once

Each chain is queued and runs when it is awaited, in order. Awaiting it twice does not run
it twice, because a chain ending in `submit` would write twice. A chain that failed says
the same thing on every await rather than answering the second one with success.

## A storage adapter of your own

The panel takes bytes through a port, so the disk behind it is yours to write: a bucket, a
folder, a service nobody else has. What the port asks of one is not obvious from its five
methods, and the part that is easy to miss is the one that loses files. A staged file is one
a reader chose and may never save, and it has to be distinguishable from a file that
belongs, or the first sweep after a save deletes the upload the reader just made.

`checkStorageAdapter` runs the promises against your adapter and hands back what it got
wrong. An empty list is the contract kept:

```ts
import type { StorageAdapter } from "@perchjs/core";
import { checkStorageAdapter } from "@perchjs/testing";

// `disk` is yours: the S3 one, the folder one, whichever you wrote.
export async function complaints(disk: StorageAdapter): Promise<readonly string[]> {
  return await checkStorageAdapter(disk);
}
```

Wrap that in one assertion of whatever runner you use. It names no runner itself, which is
why it returns a list rather than asserting.

It writes to the adapter it is given, under the staging prefix and one directory, so point
it at a disk you are willing to have written to rather than at production.

Two things it cannot check. Whether a committed file really is where `url()` says is a
question about a bucket or a folder rather than about the interface. And `remove()` has
nothing to ask afterwards, so what is checked is that calling it twice, and on a key that
was never there, does not raise: the save's failure path and a deleted row can both reach
the same key, and neither is in a position to find out first.

## A data adapter of your own

The same, for rows. `@perchjs/prisma` is one implementation of that port and yours can be
another, and what the port asks is mostly written in its comments rather than in its
signatures. The one that costs a reader most is paging: a page has to end on something
unique even when the sort does not, or two pages hand back the same row and never mention
another, and nothing says so.

```ts
import type { DataAdapter } from "@perchjs/core";
import { checkDataAdapter } from "@perchjs/testing";

export async function complaints(adapter: DataAdapter): Promise<readonly string[]> {
  return await checkDataAdapter(adapter, {
    model: "Person",
    // Tied on one path, so the order between them is the adapter's to settle.
    rows: [
      { set: { firstName: "Ada", country: "uk" } },
      { set: { firstName: "Grace", country: "uk" } },
      { set: { firstName: "Mei", country: "uk" } },
    ],
    tiedOn: "country",
  });
}
```

It writes three rows to the model you name and leaves them there, so point it at a database
you are willing to have written to. Reading is bounded: it takes up to twenty-five pages of
one row, which crosses plenty of boundaries without being a query per row of a large
table. Beyond paging it checks that a read which says nothing
about deleted rows does not get them, that `restore` answers how many rows it lifted rather
than how many were asked for, that a model which marks is marked rather than emptied, and
that a transaction which throws keeps nothing.

Give it `filterOn` and `searchOn` and it checks what a query means as well as what the port
promises: the seven operators a string can answer, that a total counts what matched rather
than what the table holds, and that a search reaches the paths it was handed and no others.
That last one is not tidiness. Which columns a search touches is an authorization decision,
and an adapter that reads them all answers questions about columns nobody was shown, one
letter at a time.

Relations are still not checked: `attach` and `detach` want a join table this has no way to
name, and an include wants a second model. That wants a contract of its own.

## What it will not do

It will not tell you a panel worked when it did not, and several of its assertions exist
only for that.

A save that raised answers 500 and names no field, so the tree keeps the errors it had
before, which were none. Read plainly, `submit().assertNoErrors()` would go green over a
panel that exploded. Every assertion about a save checks whether the save happened first.

The same holds for actions: one that raised and one that turned the record down both leave
nothing processed, and they are told apart.
