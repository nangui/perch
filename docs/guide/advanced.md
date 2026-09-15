---
title: Advanced
---

# Advanced

How the panel decides what a form is, what it lets in, and what a page costs. None of it
is needed to build a panel, and all of it is worth reading once you have.

## The resolution cycle

Seven stages and exactly one loop.

A resolver may call `set()`, which changes a value another resolver reads, so one pass is
not enough. The loop runs again and exits as soon as a pass changes nothing.

**It is bounded at five passes.** Past that it throws, naming the fields still moving.
That matters more than it sounds: two fields each visible only while the other is empty
admit both, then neither, then both again, for ever. Stopping quietly at the bound would
answer with whichever set the last pass happened to produce, and that answer would be
stable enough to look intentional.

So a form that cannot settle fails loudly, at the moment it is asked, with the names of
the fields that are arguing.

### Partial resolution

A round trip carries the path that changed. The cycle keeps a trace of which state paths
each resolver read on the previous pass, so a change to `countryId` re-runs the resolvers
that read `countryId` and leaves the rest alone.

That is why a form of forty fields costs what one dependent field costs, rather than forty
resolvers on every keystroke.

## The trust boundary

Everything a client sends is replayed against the schema tree before anything reads it.
This is stage five, and it is the one piece of the framework worth understanding in full.

**A field is admitted only if the tree resolved from the values already admitted says it
may be.** Nothing the client sent ever decides its own fate.

Read that twice. It means a hidden field can be unlocked only by a field that is itself
editable, and the chain starts from the record, which the client never touched. There is
no arrangement of values that lets a payload authorise itself.

What is dropped, in silence: a path no field admits, a field that is invisible, one that
is disabled or read-only, a value of the wrong shape, an option nothing offered.

The silence is the point. A message saying *which* value was refused is a message that
teaches somebody how to craft the next one.

### It lives in one place

`/state` and the save routes confront a payload with the same code. Two copies would
drift, and the one that drifted would be the one that writes.

### It has the same bound

Admission loops for the same reason resolution does, with the same five passes and the
same posture past them: it fails rather than settling on whatever the last pass produced.
The message names fields, so it stays on the server and the reader gets a plain 500.

## What a page costs

Three numbers, each held by a test that blocks the build.

**One query per page.** Every relation a column or an entry names becomes part of one
`include`. A table that fetched an author per row would look perfectly correct on screen,
so the count is asserted rather than hoped for.

**150 ms at the 95th percentile** on `/state`, measured across a hundred round trips.

**One round trip per change.** A `.live()` field sends one request; nothing polls, nothing
subscribes, and a tab that is opened fetches nothing because it was resolved with the rest.

## A field of your own

Two halves. A class on the server that says what it is and what it admits:

```ts
import type { FieldState, ValueRefusal } from "@perchjs/core";
import { baseFieldState, configured, Field, isUnset } from "@perchjs/core";

export interface StarRatingState extends FieldState {
  readonly max?: number;
}

export class StarRating extends Field {
  declare readonly state: StarRatingState;

  override get type(): string {
    return "StarRating";
  }

  protected override with(patch: Partial<StarRatingState>): this {
    return super.with(patch);
  }

  static make(name: string): StarRating {
    // Through `configured`, or your field is the one `configureUsing` does not
    // reach.
    return configured(new StarRating(baseFieldState(name)));
  }

  max(value: number): this {
    return this.with({ max: value });
  }

  /** What may arrive. Anything else is dropped at the boundary. */
  override admits(value: unknown): ValueRefusal | undefined {
    // Clearing is always allowed: it is the one thing no declaration names.
    if (isUnset(value)) return undefined;
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? undefined
      : "wrong-shape";
  }
}
```

And a renderer in the browser under the same key:

```ts
import { registerComponent } from "@perchjs/ui";

registerComponent("StarRating", StarRatingRenderer);
```

`admits()` is the half that matters. It is what stands between your column and whatever
somebody posts, and it is asked before any of your code sees the value. A field that
admits everything is a field with no boundary, whatever its renderer draws.

`isUnset` is the framework's own test for "nothing at all", and using it rather than
writing the three cases by hand is what keeps your field agreeing with every other one
about what empty means.

## A data source of your own

`DataAdapter` is the port every query goes through, and the reason `@perchjs/nest` never
imports `@perchjs/prisma`. Implementing it is how a panel comes to read something other
than a Prisma schema.

It is deliberately not documented as a supported path yet. The interface is stable enough
to read and not yet stable enough to promise, and one adapter shipping against a moving
contract is how a framework acquires a compatibility problem it did not need.

## Where to look when something is wrong

| What you see | Where it is decided |
|---|---|
| A field draws but never saves | `dehydrated`, or a column the model has not |
| A value arrives and vanishes | the boundary: invisible, disabled, read-only, or wrong shape |
| A form will not settle | two resolvers arguing; the error names them |
| A page is slow | the query count, then the resolvers that read the most paths |
| A panel will not start | the boot audit, which names the field and the reason |
