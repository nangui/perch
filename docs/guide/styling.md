---
title: Styling
---

# Styling

The bundle ships compiled. There is no build for you to configure, so a theme is a
stylesheet that redefines what the panel declares, linked after its own.

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
      styles: ["/theme.css"],
    }),
  ],
})
export class AppModule {}
```

Last one wins, which is why yours comes after.

## Tokens

Every colour, size, radius and shadow is a custom property. Sixty-seven of them, grouped
by what they are for rather than by what they look like.

```css
:root {
  --perch-accent: #21594a;
  --perch-accent-hover: #1a4a3e;
  --perch-radius: 6px;
  --perch-font-sans: "Inter", system-ui, sans-serif;
}
```

Seventeen families: `accent`, `border`, `content`, `control`, `danger`, `focus`, `font`,
`help`, `modal`, `pending`, `radius`, `shadow`, `space`, `success`, `surface`, `text` and
`warning`.

Every one of them is read by something. A token nothing reads is a setting that looks
like it works, so when you cannot find the one that controls a thing, the answer is that
it is controlled somewhere else rather than that you have missed it.

Component styles reference these and never a raw colour. That is the rule the token layer
exists to make possible: a screen that names `#21594a` cannot be re-themed, and one theme
is how raw colours get back into components.

## Fonts

The panel ships no font files. Both font tokens are stacks with real fallbacks, so you
can load the named faces yourself or let the fallback stand.

```css
:root {
  --perch-font-sans: "Your Face", system-ui, sans-serif;
}
```

## Dark

```html
<body data-perch-theme="dark">
```

Stamped on an ancestor, by you. The panel does **not** follow `prefers-color-scheme`.

That is deliberate and worth the sentence: the dark ramp is derived rather than designed,
surfaces inverted and the accent lightened to hold contrast. Following the desktop setting
meant serving a derived ramp by default, which showed the moment somebody opened the panel
on a dark machine. So it is a decision somebody makes rather than one inherited from a
setting the design was never checked against.

Both ramps are defined with `:where()`, which carries no specificity, so anything you
write wins without a fight.

## Stable classes

Every element carries a `perch-` class, and they do not change between patch releases.
`.perch-field`, `.perch-table__cell`, `.perch-nav__link`, and so on: the same hooks you
would use to override a component you cannot fork.

```css
.perch-nav__link[aria-current="page"] {
  border-left: 3px solid var(--perch-accent);
}
```

Prefer a token when one exists. A class is for the shape of a thing; a token is for its
colour, and changing a colour in one place is what keeps the panel looking like one
product.

## What to reach for, in order

1. **A token**, if the thing you want to change is a value.
2. **A class**, if it is a shape or a position.
3. **A render hook**, if it is something that should not be there at all or something that
   should.

If you find yourself writing a stylesheet that fights the panel rather than tuning it, the
thing you want is probably the third one.
