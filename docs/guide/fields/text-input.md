---
title: TextInput
---

# TextInput

One line of text, and most of what a form is made of.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("name").label("Full name").required().maxLength(120),
    ]);
  }
}
```

## Flavours

The kind of thing the box holds. Each one changes the keyboard a phone offers and what
the browser refuses before the form is sent.

`.email()`, `.url()` and `.numeric()` are **also checked on arrival**, which is the part
worth knowing: an `input[type=email]` refuses what a person types and refuses nothing
else, so anything reaching the field another way, a forged state or a cell edited in a
table, was writing `not-an-address` into a column the form said held an address.

Anything, including a value that is not text. A forged state can carry `true` as easily
as it can carry a word.

That one is refused a step earlier, at the boundary rather than by the rule. A flavour is
a shape, and `true` is not a badly written address: it is not one. It is discarded the
way every other shape violation is, in silence, with nothing said back to whoever sent
it. The rule still answers for text that is text and not an address, which is the case a
person can actually produce.

`.tel()` and `.password()` add no such check. A telephone number has no shape worth
refusing across countries, and a password is whatever somebody chose. If either needs a
shape, `.rule()` is where it goes.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("email").email(),
      TextInput.make("website").url(),
      TextInput.make("phone").tel(),
      TextInput.make("password").password(),
      // The step is the grain. 1 means whole numbers; 0.01 means two decimals.
      TextInput.make("quantity").numeric(1),
    ]);
  }
}
```

`.password()` hides what is typed. It does not hide what is stored, and it does not hash
anything: what reaches the column is what was typed, so hash it on the way in with
`mutateFormDataBeforeCreate`.

## Length

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("handle").minLength(3).maxLength(30),
    ]);
  }
}
```

Both are drawn on the control and checked again on the server. The second is the one that
matters: the first is a courtesy to somebody typing, and a courtesy is not a guarantee.

Length is counted in graphemes, not in code units. An emoji is one character, and a
family emoji is one character, because a limit that calls one of them seven is a limit
nobody can reason about and a counter that disagrees with the error under it.

## Affixes

Words or marks inside the frame, on either side of what is typed.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Site" })
export class SitesResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("domain").prefix("https://").suffix(".example.com"),
      TextInput.make("search").prefixIcon("search"),
    ]);
  }
}
```

An affix is decoration and is announced to nobody: it is not part of the value, and it is
not part of what a screen reader reads out. Whatever it needs to say in words belongs in
`.hint()`.

## A mask

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Card" })
export class CardsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("number").mask("9999 9999 9999 9999")]);
  }
}
```

A mask shapes what is typed **and is checked again on the server**: `9` takes a digit,
`a` a letter, `*` either, and anything else is a literal.

The literals are stripped before the comparison, so `(555) 123-4567` and `5551234567`
both fit `(999) 999-9999`. Demanding the punctuation would refuse every row written
before the mask was added, and refuse one whose `dehydrateStateUsing` takes the
punctuation off, which is the ordinary way to store a number.

## Unique

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("email").email().unique()]);
  }
}
```

Asked of the database, and on an edit the row being edited is not counted against itself.
Pass `{ ignoreRecord: false }` if it should be.

It is a check, not a guarantee: two readers saving the same address at the same moment
both pass it. The column's own unique constraint is what actually holds, and this is what
turns that constraint into a message on a field instead of a failed write.
