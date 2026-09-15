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

## What it will not do

It will not tell you a panel worked when it did not, and several of its assertions exist
only for that.

A save that raised answers 500 and names no field, so the tree keeps the errors it had
before, which were none. Read plainly, `submit().assertNoErrors()` would go green over a
panel that exploded. Every assertion about a save checks whether the save happened first.

The same holds for actions: one that raised and one that turned the record down both leave
nothing processed, and they are told apart.
