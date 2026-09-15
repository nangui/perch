---
title: Schemas
---

# Schemas

A schema is a tree of components. Forms are one, infolists are another, and the layout
components in between are the same components in both.

```ts
import { Grid, Schema, Section, TextInput, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Section.make("Content").schema([
        TextInput.make("title").required(),
        Textarea.make("body").rows(10),
      ]),
      Grid.make(2).schema([
        TextInput.make("slug"),
        TextInput.make("publishedAt"),
      ]),
    ]);
  }
}
```

That the two share a tree is the design rather than a convenience. One engine resolves
both, one boundary checks both, and a layout written for a form needs nothing added to it
to hold entries instead.

## What every component carries

Layouts are components too, so these work on a `Section` exactly as they work on a
`TextInput`.

| | |
|---|---|
| `.visible(…)` `.hidden(…)` | whether it is there at all, resolved on the server |
| `.columnSpan(2)` | how much of the surrounding grid it takes |
| `.label("…")` | what it is called |
| `.helperText("…")` | a line under it |
| `.hint("…")` `.hintIcon("info")` | a word beside the label, and a mark before that word |
| `.disabled()` | drawn and refused on the way back in |
| `.key("…")` | its identity, when the tree is built from something that moves |
| `.extend(…)` | a hook's way in, for a plugin adding to a tree it does not own |

**A hidden section takes its children with it**, and takes their values too. They are
not drawn, not validated and not saved, and nothing about them crosses: a record holding
a wage sends a state with no wage in it when the section holding that field is hidden.

That makes `.visible()` on a layout a way to switch a whole part of a form off for a
reader, rather than a way to tidy one. It is a protection, and the values behind it stay
on the server where they were.

## Sections

```ts
import { Schema, Section, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Section.make("Publishing")
        .description("Nothing here is visible to readers until it is live.")
        .icon("calendar")
        .collapsible()
        .collapsed()
        .schema([TextInput.make("publishedAt")]),
    ]);
  }
}
```

A titled block, optionally described, optionally with a mark, and optionally folded. Use
`.collapsed()` for the part most readers will not touch, and remember that a collapsed
section is still a section: its fields are drawn, validated and saved like any other.

## Fieldsets

```ts
import { Fieldset, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      Fieldset.make("Address").schema([
        TextInput.make("street"),
        TextInput.make("city"),
        TextInput.make("postcode"),
      ]),
    ]);
  }
}
```

A section and a fieldset look similar and say different things. A section is a part of a
page. A fieldset is a group of fields that answer one question together, and it says so
to a screen reader through its legend, which is the reason to reach for it over a section
with a heading.

## Grids

```ts
import { Grid, Schema, TextInput, Textarea } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      // One column on a narrow screen, three once there is room.
      Grid.make({ default: 1, md: 3 }).schema([
        TextInput.make("title").columnSpan(2),
        TextInput.make("slug"),
        Textarea.make("body").columnSpan(3),
      ]),
    ]);
  }
}
```

`Grid.make(3)` is three columns everywhere. The object form says what to do on a narrow
screen and what to do once there is room, which is usually what you want: three columns
on a phone is three unreadable columns.

`.columnSpan()` decides what stretches. It is a component method, so it works on a nested
section as readily as on a field.

## Tabs

```ts
import { Schema, Tab, Tabs, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Tabs.make()
        .persistTab()
        .tabs([
          Tab.make("Content").schema([TextInput.make("title")]),
          Tab.make("SEO").schema([TextInput.make("metaDescription")]),
        ]),
    ]);
  }
}
```

One form, several panels, one round trip. Nothing is fetched when a tab is opened,
because it was all resolved together.

`.persistTab()` keeps the open tab **in the address**, not in storage on the machine.
What a link carries is the thing another person can be shown, and a tab remembered
privately is one nobody else lands on.

## Callouts

```ts
import { Callout, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      Callout.make("This invoice has been sent")
        .description("Changing it here will not change the copy the customer has.")
        .tone("warning"),
      TextInput.make("total"),
    ]);
  }
}
```

A note to the reader rather than an input. The four tones are the ones a badge and an
entry already use, which is deliberate: a fifth name here would be a colour the stylesheet has
not got, and would read as a rendering fault rather than as a tone.

Being a component, a callout takes `.visible()`, which is what makes it a good way to say
something that is only true sometimes.

## Nesting

Layouts nest, in any order. A section holding a grid holding a fieldset is fine, and so
is the reverse.

What that buys is worth saying once: a form is not a list of fields with a layout applied
to it. It is a tree, and where a field sits in that tree is part of what the field is.
