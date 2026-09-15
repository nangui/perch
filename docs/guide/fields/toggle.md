---
title: Toggle
---

# Toggle

The same two values as a [Checkbox](/fields/checkbox), and a different promise.

```ts
import { Schema, Toggle } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Toggle.make("subscribed").label("Receives the newsletter"),
    ]);
  }
}
```

A checkbox says "this will be true when you save". A switch says "this is true now".
They hold the same boolean and mean different things to the person reading them, which
is why both exist rather than one with a flag on it. The choice between them is the
choice of what to promise.

If the form has a save button and nothing happens until it is pressed, a checkbox is
honest. A switch on that same form is a small lie, and readers have learnt to believe it.

## Marks and colour

```ts
import { Schema, Toggle } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Toggle.make("published")
        .onIcon("check")
        .offIcon("close")
        .onColor("success"),
    ]);
  }
}
```

The marks are drawn inside the switch and are announced to nobody: a switch already says
whether it is on, and a mark repeating it in a second voice is a reader told twice. They
are there for the glance, not for the screen reader.

Both names come from the panel's own set, and one it cannot draw stops the boot.

## There is no third state

A switch cannot be half on. A column that has never been written holds `null`, and the
renderer reads anything that is not `true` as off; the boundary refuses anything crossing
back that is not a boolean.

So off and never-set are the same picture, exactly as they are on a checkbox. Where that
difference matters, write the choices out with a [Radio](/fields/radio).

## Required means on

As on a checkbox, `.required()` here means **on**, not "not empty". Off is a perfectly
good value for a switch to hold and a very poor one for it to hold when it was made
mandatory.
