---
title: Checkbox
---

# Checkbox

One box, and the thing it agrees to.

```ts
import { Checkbox, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Checkbox.make("acceptsTerms").label("I accept the terms"),
    ]);
  }
}
```

Write the label as the sentence the reader is agreeing to, not as the column's name.

By default it sits above the box, like every other field's. `.inlineLabel()` puts it
beside it, which is what a checkbox usually wants: a box in front of a sentence reads as
one thing, and a sentence with a box underneath reads as two.

```ts
import { Checkbox, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Checkbox.make("acceptsTerms").label("I accept the terms").inlineLabel(),
    ]);
  }
}
```

## Required means checked

```ts
import { Checkbox, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Checkbox.make("acceptsTerms").label("I accept the terms").required(),
    ]);
  }
}
```

On every other field, `.required()` means "not empty". Here it means **checked**: an
unticked box is a perfectly good `false`, and a form that accepted it would be a form
where agreeing was optional. That is the one place this field differs from the rest, and
it is the reason it has its own rule.

## Three states, and why there are not

A checkbox holds `true` or `false`. A column holding neither, whether it is `null` or
was never set, arrives as no value at all, and the box is drawn unticked.

Which is the problem: unticked and never-answered look identical on the page, and the
reader who has not decided yet is shown the same thing as the reader who said no. If that
difference matters, this is not the field. Use a `Radio` with the choices written out, or
a `Select` with an empty option, so the three states are three things a reader can see.

## Checkbox or Toggle

The same value, a different promise. A checkbox is part of a form somebody is filling in
and will submit; a toggle reads as a switch that acts when it is moved. Use the one that
matches what happens when it is clicked.
