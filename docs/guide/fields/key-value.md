---
title: KeyValue
---

# KeyValue

The pairs in a `Json` column, edited as pairs.

```ts
import { KeyValue, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Site" })
export class SitesResource implements PanelResource {
  form() {
    return Schema.make([
      KeyValue.make("settings").keyLabel("Setting").valueLabel("Value"),
    ]);
  }
}
```

It is for a flat object of text: settings, metadata, labels.

## Two shapes, deliberately

What the field holds and what the column holds are not the same thing, and that is the
design rather than an accident.

The column keeps an **object**, because that is what a `Json` column of settings already
holds and what everything else reading it expects. The form keeps an **ordered list of
pairs**, because a key is a thing the reader types into: editing one as an object key
means deleting and re-adding an entry on every keystroke, which loses the row's place and
the cursor with it.

The field converts between them. Above it everything sees pairs, in the database an
object, and neither end has to know about the other.

## What happens to the awkward cases

Keys are settled where the object is built:

- A key is trimmed, and a row whose key is then blank is not an entry.
- Two rows of one name are one entry: the last of them, which is what an object says and
  what the reader is looking at.
- Two keys that differ only by the space around them are one key.

None of these is refused while the reader is typing. A blank key is what pressing "Add"
gives you, a typed space is a typed space, and the same name twice is two rows somebody
can see. Refusing any of them at the boundary would throw away everything else they had
written, in silence.

## Values that are not text

The field holds text. A column entry holding something else, a number or a nested object,
is shown as the JSON it is rather than dropped.

Dropping it would take it off the page, and the next save, which writes the pairs and
nothing else, would take it out of the column too with nobody having asked. Shown, it
survives. What it costs is that a number saved back is text.

## `__proto__`

It is a key a settings column can hold, so the object is built without a prototype.
Assigned on a plain object it would call a setter rather than make a property, and the
pair would go missing between the form and the row.
