/**
 * The panel, dressed from outside.
 *
 * Nothing here is a fork. Every rule reaches the panel through the stable class
 * it already puts on the element, which is what the architecture promises when
 * it says a reader overrides without forking — and the promise holds because
 * the panel's own rules are all inside a cascade layer and this sheet is in
 * none, so an ordinary selector here outranks whatever the panel wrote however
 * specific the panel's was.
 *
 * Served from the application rather than copied into the package, because
 * that is how a reader would do it: `styles: ["/theme.css"]` on the module, a
 * file of their own at that address.
 */
import { Controller, Get, Header } from "@nestjs/common";

const THEME = String.raw`
/* ---------------------------------------------------------------- the ground */

.perch-root {
  --perch-accent: #2563eb;
  --perch-accent-hover: #1d4ed8;
  --perch-accent-surface: #eff6ff;
  --perch-accent-border: #bfdbfe;
  --perch-accent-ring: rgb(37 99 235 / 0.25);
  --perch-surface-page: #f6f7f9;
  --perch-border: #e8eaee;
  --perch-border-subtle: #f1f2f5;
  --perch-radius: 8px;
  --perch-radius-lg: 14px;
  --perch-radius-sm: 6px;
}

[data-perch-theme="dark"] {
  --perch-accent: #60a5fa;
  --perch-accent-hover: #93c5fd;
  --perch-accent-surface: #10203c;
  --perch-accent-border: #1e3a5f;
  --perch-surface-page: #0a0c10;
}

/* ------------------------------------------------------------- the shell */

/* A sidebar that reads as a panel of its own rather than as a column the
   content happens to start after. */
.perch-nav {
  padding: 20px 14px;
  background: var(--perch-surface);
  border-right: 1px solid var(--perch-border);
}

.perch-nav__heading {
  padding: 0 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--perch-content-subtle);
}

/* The links carry the shape of the thing they open rather than being text that
   happens to be clickable. */
.perch-nav__link {
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  font-weight: 500;
  transition:
    background 120ms ease,
    color 120ms ease;
}

.perch-nav__link:hover {
  background: var(--perch-surface-muted);
}

.perch-nav__link[aria-current="page"] {
  background: var(--perch-accent-surface);
  color: var(--perch-accent);
  font-weight: 600;
}

.perch-shell__main {
  padding: 28px 32px 48px;
}

.perch-page__title,
.perch-list__title {
  font-size: 28px;
  letter-spacing: -0.02em;
}

/* ------------------------------------------------------------- the cards */

/* Four tinted cards rather than four white ones.

   Reached from the description rather than from the card. A card's tone is a
   recipe variant and it lands on one slot: perch-stat__description--tone_x
   on the line under the number, and nothing at all on the card itself. So
   there is no class and no attribute on the root to select, and :has()
   is what reaches back up to it.

   Two things follow from that, and they are the panel's to fix rather than
   this sheet's. A card given a tone and no description carries the tone
   nowhere, so it tints as the default. And a theme that wanted to colour the
   whole card has to know which slot the variant landed on, which is exactly
   the knowledge a stable class is supposed to save a reader. */
.perch-stat__root {
  padding: 18px 20px;
  border: 0;
  border-radius: 14px;
  background: #eef2ff;
  box-shadow: none;
}

.perch-stat__root:has(.perch-stat__description--tone_success) {
  background: #e9f7ef;
}

.perch-stat__root:has(.perch-stat__description--tone_warning) {
  background: #fdf4e3;
}

.perch-stat__root:has(.perch-stat__description--tone_danger) {
  background: #fdeceb;
}

/* The mark sits on a tile of its own, which is what makes a row of cards read
   as a set rather than as four paragraphs. */
.perch-stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--perch-surface);
  color: var(--perch-accent);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.06);
}

.perch-stat__value {
  font-size: 30px;
  letter-spacing: -0.02em;
}

.perch-stat__label {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--perch-content-muted);
}

/* ------------------------------------------------------------- the table */

.perch-list__table,
.perch-list__search {
  border: 1px solid var(--perch-border);
  border-radius: 14px;
  box-shadow: none;
}

.perch-list__search {
  padding: 14px 16px;
  background: var(--perch-surface);
}

.perch-table__head {
  padding: 12px 16px;
  background: var(--perch-surface-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--perch-content-muted);
}

.perch-table__cell {
  padding: 14px 16px;
}

.perch-table tbody tr:hover {
  background: var(--perch-surface-muted);
}

/* ------------------------------------------------------------ the controls */

/* A pill rather than a rectangle, which is the single change that dates a
   panel most. */
.perch-button {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  font-weight: 500;
}

.perch-button--primary {
  background: var(--perch-accent);
  border-color: var(--perch-accent);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.1);
}

.perch-control {
  height: 38px;
  border-radius: 10px;
}

.perch-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 500;
}
`;

@Controller()
export class ThemeController {
  @Get("theme.css")
  @Header("Content-Type", "text/css; charset=utf-8")
  @Header("Cache-Control", "public, max-age=60")
  sheet(): string {
    return THEME;
  }
}
