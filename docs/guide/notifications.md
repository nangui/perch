---
title: Notifications
---

# Notifications

What an action says when it is done.

```ts
import { Notification } from "@perchjs/core";

export const archived = Notification.make()
  .title("Post archived")
  .body("It is out of the list and still in the database.")
  .success();
```

An action's callback returns one, or nothing.

```ts
import type { Row } from "@perchjs/core";
import { Action, Notification } from "@perchjs/core";

class ArchiveAction extends Action {
  static make(): ArchiveAction {
    return new ArchiveAction({});
  }
  override get type(): string {
    return "ArchiveAction";
  }
  protected override with(state: ConstructorParameters<typeof Action>[0]): this {
    return new ArchiveAction(state) as this;
  }
}

export const archive = ArchiveAction.make()
  .name("archive")
  .label("Archive")
  .action((record: Row) => {
    void record;
    return Notification.make().title("Archived").success();
  });
```

Returning nothing says nothing, which is right when the effect is visible on the page the
reader is already looking at. A row that vanishes from a list has announced itself.

## A title is the whole message

`.title()` is the one part a reader is guaranteed to see, and nothing enforces it: a
notification built without one carries an empty title and is shown as an empty message.

Write it as what happened, in the words somebody who did not read your code would use.
`.body()` is for the sentence after it, and is worth leaving off when there is nothing to
add.

## Tone

`.success()`, `.warning()` and `.danger()`. The default is `info`.

The tone is what the reader reads first, so it should describe what happened rather than
how the writer feels about it. A delete that worked is a success, even when the thing it
deleted was important.

## It carries no timing and no channel

Where a notification is shown and for how long is the renderer's business.

An action that decided it would be deciding something it cannot see: it does not know
whether the reader is on a phone, whether five other things just happened, or whether the
page it is about to be shown on still exists. So a notification is a title, an optional
body and a tone, and nothing else.

That also leaves room for the channels that arrive later, an email or a toast queue or a
database record, without changing what an action returns.

## Surviving a redirect

A save that redirects has a problem: the message belongs to what just happened, and the
page that would show it is about to be replaced.

So the message is kept before the navigation and read by the next page, once. Reloading
that page does not repeat it, because reading it also drops it.

It is kept in the browser's session storage, which can fail: a private window, a storage
limit, a runtime with none at all. Each of those throws, and each is caught. **A message
nobody sees is not worth a page that does not load.**

## One at a time

A second message replaces the first rather than queueing behind it.

That is a decision rather than a simplification. Two messages about two things, shown
together after a redirect, are two things a reader has to reconcile with one page; and a
queue is a thing that grows when something goes wrong repeatedly, which is exactly when a
reader least wants a list.

## What a notification is not

It is not an error report. A form that does not validate comes back with its errors on
the fields they belong to, which is where somebody can act on them. A notification saying
"something was wrong" above a form that shows nothing is the worst of both.

It is not an audit trail either. It is what a person is told, once, about something they
just did.
