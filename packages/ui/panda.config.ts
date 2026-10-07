/**
 * The styling system, and the design it carries.
 *
 * Panda reads the source, finds the style calls, and writes one plain CSS file.
 * Nothing is injected at run time, which is what lets this coexist with the
 * promise the package already makes: the panel ships precompiled and nobody
 * configures a build to install it.
 *
 * **This file is now where the design lives.** Every colour, size, radius and
 * shadow the panel draws with is declared below, once, with its dark value
 * beside its light one. `tokens.css` held them before, in two blocks seventy
 * lines apart that only a test kept level.
 *
 * Why the values are in `globalCss` and the tokens only point at them. The
 * `--perch-*` custom properties are the panel's public theming API, and that is
 * a published promise rather than an accident: the bundle ships compiled, so a
 * theme is a file that redefines them and is linked after. Panda names its own
 * properties after their category, so letting it own them outright would have
 * renamed all hundred and eight and broken every theme in existence. Declaring
 * them here and aliasing them keeps that contract exactly as published, and a
 * theme that overrides `--perch-accent` still reaches a recipe that reads it.
 *
 * Three settings carry the rest of the reasoning.
 *
 * `preflight: false`, because the panel already resets what it owns, scoped
 * under `.perch-root`. A document-wide reset here would be this package
 * deciding how the other half of somebody's page looks.
 *
 * The dark condition is the panel's own attribute rather than the desktop's
 * preference. That decision is already written down: the dark ramp is derived
 * rather than designed, so a host asks for it instead of inheriting it from a
 * setting the design was never checked against.
 *
 * And every recipe names its own class. Panda would otherwise invent one, and
 * the architecture promises a stable class on every structural element so a
 * reader can override without forking. A recipe called `perch-stat` with a
 * `label` slot emits `perch-stat__label` — the name that is already there, now
 * generated instead of hand-written.
 *
 * Park UI is not here, and it was the reason to choose this engine. Its preset
 * declares a peer range that admits Panda 2 and contributes configuration that
 * Panda 2 rejects: array conditions, which 2 removed. Holding the styling
 * engine a major version back to borrow a palette is the worse trade, and the
 * design this panel has is the one below.
 */
import { defineConfig } from "@pandacss/dev";

/**
 * A colour that changes with the ramp, written once.
 *
 * Light first, dark second, and the tuple is why this exists: the sheet this
 * replaces kept the two in blocks seventy lines apart, so every one of these
 * thirty-five was written twice and each was a chance to change one and forget
 * the other. A pair cannot be half written — the type refuses it — and the two
 * blocks below are derived from it rather than maintained beside it.
 */
const RAMP: Readonly<
  Record<`--perch-${string}`, readonly [light: string, dark: string]>
> = {
  "--perch-accent": ["#21594a", "#6cbfa5"],
  "--perch-accent-border": ["#dbe6e2", "#24413a"],
  "--perch-accent-hover": ["#163f34", "#8ed4bd"],
  "--perch-accent-ring": ["rgb(33 89 74 / 0.28)", "rgb(108 191 165 / 0.32)"],
  "--perch-accent-surface": ["#f2f7f5", "#14231f"],
  "--perch-accent-track": ["#a8bdb5", "#3d6b5e"],
  "--perch-accent-track-border": ["#8ba79d", "#4e8071"],
  "--perch-border": ["#dfe3e6", "#333c41"],
  "--perch-border-hover": ["#59646a", "#8c979d"],
  "--perch-border-strong": ["#767f84", "#6b757b"],
  "--perch-border-subtle": ["#eef0f1", "#262d31"],
  "--perch-content": ["#14181a", "#eef0f1"],
  "--perch-content-inverse": ["#ffffff", "#0d1012"],
  "--perch-content-muted": ["#59646a", "#a3adb2"],
  "--perch-content-secondary": ["#3c464b", "#c4cace"],
  "--perch-content-subtle": ["#616c72", "#8c979d"],
  "--perch-danger": ["#a32b1c", "#e8705c"],
  "--perch-danger-border": ["#e3c9c4", "#4a2622"],
  "--perch-danger-content": ["#7d2114", "#f4a396"],
  "--perch-danger-surface": ["#fdf4f2", "#241412"],
  "--perch-danger-surface-strong": ["#fbe9e5", "#2e1a17"],
  "--perch-overlay-scrim": ["rgb(20 24 26 / 0.4)", "rgb(0 0 0 / 0.6)"],
  "--perch-pending-border": ["#c9c3a8", "#4a4635"],
  "--perch-pending-surface": ["#fbfaf5", "#1f1d16"],
  "--perch-shadow-dragging": [
    "0 8px 18px rgb(20 24 26 / 0.14)",
    "0 8px 18px rgb(0 0 0 / 0.6)",
  ],
  "--perch-shadow-overlay": [
    "0 12px 32px rgb(20 24 26 / 0.14)",
    "0 14px 36px rgb(0 0 0 / 0.6)",
  ],
  "--perch-shadow-panel": [
    "0 2px 6px rgb(20 24 26 / 0.08)",
    "0 2px 8px rgb(0 0 0 / 0.45)",
  ],
  "--perch-shadow-popover": [
    "0 6px 16px rgb(20 24 26 / 0.1)",
    "0 6px 16px rgb(0 0 0 / 0.5)",
  ],
  "--perch-shadow-raised": [
    "0 1px 2px rgb(20 24 26 / 0.06)",
    "0 1px 2px rgb(0 0 0 / 0.4)",
  ],
  "--perch-success-content": ["#15503a", "#86d0ac"],
  "--perch-success-surface": ["#dff0e7", "#14261d"],
  "--perch-surface": ["#ffffff", "#181d20"],
  "--perch-surface-muted": ["#f6f7f8", "#23292c"],
  "--perch-surface-page": ["#e9ebec", "#0b0e0f"],
  "--perch-surface-raised": ["#ffffff", "#22282b"],
  "--perch-surface-skeleton": ["#e2e6e8", "#283034"],
  "--perch-surface-skeleton-strong": ["#eceef0", "#222a2d"],
  "--perch-surface-sunken": ["#eef0f1", "#232a2e"],
  "--perch-warning-content": ["#6b4700", "#e5c07b"],
  "--perch-warning-surface": ["#f6ecd6", "#2a2013"],
};

/**
 * What does not change with the ramp: the type stack, the scales, the sizes.
 */
const FIXED: Properties = {
  "--perch-control-height": "34px",
  "--perch-control-height-inner": "32px",
  "--perch-control-height-sm": "28px",
  "--perch-focus-ring":
    "0 0 0 1px var(--perch-surface), 0 0 0 3px var(--perch-accent-ring)",
  "--perch-font-mono": '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace',
  "--perch-font-sans": '"Libre Franklin", system-ui, -apple-system, sans-serif',
  "--perch-help-line-height": "16px",
  "--perch-modal-width": "28rem",
  "--perch-radius": "4px",
  "--perch-radius-lg": "6px",
  "--perch-radius-sm": "3px",
  "--perch-space-1": "2px",
  "--perch-space-10": "32px",
  "--perch-space-2": "4px",
  "--perch-space-3": "6px",
  "--perch-space-4": "8px",
  "--perch-space-5": "10px",
  "--perch-space-6": "12px",
  "--perch-space-7": "16px",
  "--perch-space-8": "20px",
  "--perch-space-9": "24px",
  "--perch-text-2xl": "20px",
  "--perch-text-base": "12px",
  "--perch-text-control": "13px",
  "--perch-text-lg": "14px",
  "--perch-text-sm": "11px",
  "--perch-text-xl": "16px",
  "--perch-text-xs": "10px",
};

/**
 * One ramp's half of the pairs, as a style object.
 *
 * Typed by the same key shape as the table it reads, because a plain
 * `Record<string, string>` is not a style object: Panda admits a custom
 * property and refuses an arbitrary key, and that refusal is the point. The
 * one cast is `Object.fromEntries`, which widens every key it builds back to
 * `string` whatever it was handed.
 */
type Properties = Readonly<Record<`--perch-${string}`, string>>;

const ramp = (at: 0 | 1): Properties =>
  Object.fromEntries(
    Object.entries(RAMP).map(([name, pair]) => [name, pair[at]]),
  ) as Properties;

export default defineConfig({
  outdir: "src/styled-system",
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],

  /**
   * The base preset, named rather than assumed.
   *
   * It is what maps a property to a token category — `color` to `colors`,
   * `gap` to `spacing`. Without it the recipes compiled to the token names
   * themselves: `color: content-secondary`, which is not a colour and not CSS,
   * and which no browser reports.
   */
  /**
   * Namespaced, so the alias layer is visibly the panel's own.
   *
   * Without it the generated properties are `--colors-surface` and
   * `--spacing-7`: names general enough to be somebody else's, in a stylesheet
   * this package publishes.
   */
  prefix: { cssVar: "perch" },

  presets: ["@pandacss/preset-base"],
  preflight: false,

  /**
   * Emit the recipes whether or not a style call names them.
   *
   * Panda writes CSS for what it finds in the source. That is the right
   * default and the wrong one here while the migration is partway: a surface
   * still drawn by hand has no style call to find, and a recipe written for it
   * ahead of time would emit nothing.
   */
  staticCss: { recipes: { stat: ["*"], widgets: ["*"] } },

  conditions: {
    extend: {
      /** Stamped by a host that wants it, never read off the machine. */
      dark: '[data-perch-theme="dark"] &',
      /**
       * Where the panel already folds.
       *
       * `40rem`, which is the width five other rules in this panel narrow at.
       * The widget grid arrived with a `720px` of its own — the only one in the
       * stylesheet — which is a second breakpoint nobody designed, two
       * and a half rem from the first.
       */
      narrow: "@media (max-width: 40rem)",
      /**
       * Above where the panel folds, and a hundredth of a rem above it.
       *
       * The pair is deliberate: a filter bar lays its controls out in a row
       * only where there is room, and the rule that stacks everything below
       * `narrow` must not be fighting it at the same width.
       */
      wide: "@media (min-width: 40.0625rem)",
    },
  },

  /**
   * The public properties, which are the design.
   *
   * Written here and read by the aliases below, so the values exist in one
   * place and the names a theme overrides do not move.
   */
  globalCss: {
    // Inside a selector, not beside one: a declaration at the top level of
    // this object reads as a selector, and twenty-six of twenty-eight were
    // silently dropped before this line said where they go.
    ":where(:root)": FIXED,
    /**
     * The control, and everything that sits inside its frame.
     *
     * Through `globalCss` rather than as recipes, and that is the whole
     * decision here. These class names are published: a theme overrides
     * `.perch-control__affix--prefix`, and a recipe cannot emit that name —
     * Panda spells a variant `--kind_prefix` and there is no setting that
     * changes it. Written here they keep every name exactly, the sixteen
     * components that wear them do not change a line, and what is gained is
     * still real: the values are token references the compiler checks, so a
     * colour that is not a token does not build and a raw one cannot be
     * written at all.
     *
     * What is given up is a typed accessor per class. The components already
     * carry these as string literals and would have either way.
     */
    /**
     * The focus ring nothing else claimed, and the icon box.
     *
     * Both are `:where()`, so both carry no specificity at all: they are
     * designed to lose to every rule that wants the same property. That design
     * only holds inside one cascade origin. Left in the hand-written sheet they
     * would be unlayered, and unlayered beats every layer however specific — so
     * the ring would have outranked the control's own focus style it was
     * written to defer to.
     *
     * Why each is what it is came over with them, late: it was written in the
     * sheet they left and stayed there when they moved, so for several
     * releases the rules were here and the reasons were in a file that no
     * longer held them.
     */
    /* A floor, not a list. Twenty-six focusable things had no ring of their own
       and fell back to the browser's outline — a blue ring in a panel that has a
       green one — and a list of them is a list somebody forgets. Matched on the
       class prefix rather than under `.perch-shell`, because a dialog and a
       popover are drawn against the body and are outside it. */
    ':where([class^="perch-"], [class*=" perch-"]):focus-visible': {
      outline: "none",
      boxShadow: "focus-ring",
    },

    /* Sized in `em` because the surface has already decided how big its words
       are, and a mark beside a word is the size of the word. `block` because an
       inline SVG sits on a text baseline, which in a line box of its own drew a
       mark three pixels high; every surface carrying one lays its children out
       with flex, so a block child is centred rather than starting a line. */
    ":where(.perch-icon)": {
      display: "block",
      flex: "none",
      width: "1em",
      height: "1em",
    },

    /**
     * The button.
     *
     * In source order, and that is load-bearing rather than tidy. Two of these
     * weigh the same: a modifier's hover and the disabled state are both a
     * class and one more thing. Between equals the later rule wins, so a
     * disabled primary button still lightens under a pointer — which is what it
     * did before this moved, and reordering would have quietly changed it.
     */

    /* The same card the sections are, so a form ends on the surface it was
       written on rather than with a button loose on the page ground. */

    /**
     * A value from a closed set: the shape says "one of a few things" before
     * the word is read.
     *
     * The radius is a spacing step rather than a radius token, and that is what
     * it was: a pill this small wants the tightest round in the scale, and the
     * radius scale starts larger. Written as the property it names rather than
     * as a token, because reading `radii` for it would be a lie about which
     * scale the value came from.
     */

    /**
     * The repeater: a card of rows, each with a grip, a name and its fields.
     *
     * Three of its selectors were declared twice in the sheet this replaces —
     * the item, the label and the fields — each time to put a later concern
     * beside the rule it belonged with rather than beside the selector. A
     * configuration object cannot hold a key twice, so the port merges them,
     * and merging is only safe because the pairs declare nothing in common.
     * Checked, property by property, before they were joined.
     */

    /**
     * The markdown editor: a toolbar, two panels, a writing surface and a
     * preview that styles the elements the markdown renders to.
     *
     * The preview's rules reach bare elements — a heading, a list, a quote — so
     * they are the lowest specificity in this surface by some distance. That is
     * safe here and worth saying why: nothing in the panel styles a bare
     * element, so there is no unlayered rule for these to lose to now that they
     * sit in a layer.
     */

    /**
     * The rich editor: a row of buttons over a page to write on.
     *
     * The page's rules reach bare elements, as the markdown preview's do, and
     * deliberately match them — moving between the two fields should not move
     * the text. Safe in a layer for the same reason: nothing in the panel
     * styles a bare element, so there is nothing unlayered for these to lose
     * to.
     */

    /**
     * An infolist entry: the value a record shows, read rather than typed.
     *
     * `.perch-entry` was declared twice in the sheet this replaces — once for
     * the line it keeps, once for the gap the copy button needs beside it. A
     * configuration object cannot hold a key twice, so they are joined; checked
     * first, and they declare nothing in common.
     */

    /**
     * The layouts a schema declares: a fieldset, a callout, a section, and the
     * grid body they all hold.
     *
     * `.perch-layout__body` reads `--perch-columns`, which a renderer sets as
     * an inline style from the count a declaration asked for. The fallback is
     * the whole point of it: a layout that named no count is one column.
     */

    /**
     * The list page: its header, the filter bar, the bulk strip, the table's
     * card and the pager's size control.
     *
     * Three rules are not here on purpose. The ones that give a native
     * `select` and a bare `input` the frame the rest of the panel has are
     * rooted in this surface, in the page-size control and in a table cell —
     * one rule each, three selectors wide. They move whole when the table does
     * rather than being split three ways and duplicated across both sheets for
     * one release.
     */
    ".perch-list": {
      flex: "1",
      minWidth: "0",
      padding: "var(--perch-space-8) var(--perch-space-9) var(--perch-space-10)",
    },

    ".perch-list__header": {
      display: "flex",
      gap: "5",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: "6",
    },

    ".perch-list__actions": { display: "flex", gap: "4" },

    ".perch-list__title": {
      fontSize: "2xl",
      fontWeight: "600",
      letterSpacing: "-0.01em",
      color: "content",
    },

    ".perch-list__total": { marginTop: "5", fontSize: "base", color: "content-muted" },

    /* The menu sits beside whatever the header already offered. */
    ".perch-list__tools": {
      display: "flex",
      alignItems: "center",
      gap: "3",
      marginLeft: "auto",
    },

    /**
     * The search sits above the table, not in its header: it acts on the whole
     * result set rather than on a column.
     *
     * A grid rather than a wrapping row, and not as a matter of taste. In a
     * wrapping row every item on a line takes that line's height, so one tall
     * filter — a schema filter is a whole fieldset — pushed every short one
     * beside it to the bottom of a 250px line. The bar took a third of the page
     * to hold eight boxes, with the short ones adrift in it. Each filter gets a
     * cell of its own and sits at the top of it, so a tall one grows downward
     * without moving anything else.
     */
    ".perch-list__search": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
      alignItems: "start",
      gap: "5",
      padding: "6",
      marginBottom: "6",
      background: "surface",
      borderRadius: "lg",
      // A panel, not a card — it holds the controls for everything below it.
      boxShadow: "panel",
    },

    /* Apply belongs to the whole bar, not to the filter it happens to sit
       beside. Its own row at the end, pushed to the right, where a form's
       confirm button is looked for. */
    '.perch-list__search > button[type="submit"]': {
      gridColumn: "1 / -1",
      justifySelf: "end",
    },

    /* A field is taller than a button everywhere else in the panel, because a
       button is not a field. Side by side in one form they have to agree, and
       the button is the one that cannot grow: its size is a pointer target. */
    ".perch-list__search .perch-control": { height: "control-height-sm" },

    /**
     * A filter carrying a schema is several controls, so it is given the room
     * of two — and the whole width where there is only room for one.
     *
     * Its controls side by side rather than stacked: a schema renders in one
     * column by default, which is right in a form and wrong in a filter bar.
     * Two boxes one above the other made the fieldset 250px tall and every row
     * of the bar as tall as it.
     *
     * The two widths below are a hundredth of a rem apart and therefore never
     * both apply, which is what keeps the row layout and the narrow stacking
     * from fighting. That used to rest on which was written later in one file
     * as well; it does not any more, and it never needed to.
     */
    ".perch-list__form": {
      gridColumn: "span 2",
      // A fieldset's own padding is a browser default meant for a page-sized
      // form, and inside a filter bar it left a hand's width of nothing under
      // the controls — which made the whole row of the grid as tall as the gap.
      margin: "0",
      padding: "0 var(--perch-space-4) var(--perch-space-4)",
      border: "1px solid var(--perch-border)",
      borderRadius: "md",
      _narrow: { gridColumn: "1 / -1" },
    },

    ".perch-list__form .perch-layout__body": {
      _wide: {
        gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
        gap: "4",
      },
    },

    /* Between the filters and the rows, where the reader's eye already is after
       ticking something. Not a floating bar: it must not cover a row. */
    ".perch-list__bulk": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "5",
      marginBottom: "6",
      padding: "var(--perch-space-5) var(--perch-space-6)",
      background: "accent-surface",
      border: "1px solid var(--perch-accent-border)",
      borderRadius: "lg",
    },

    ".perch-list__bulk-count": {
      margin: "0",
      marginRight: "auto",
      fontSize: "control",
      fontWeight: "500",
      color: "content",
      fontVariantNumeric: "tabular-nums",
    },

    ".perch-list__bulk-group": { position: "relative" },

    ".perch-list__bulk-group > summary": {
      display: "inline-flex",
      alignItems: "center",
      gap: "2",
      cursor: "pointer",
      listStyle: "none",
    },

    ".perch-list__bulk-group > summary::-webkit-details-marker": { display: "none" },

    ".perch-list__bulk-menu": {
      position: "absolute",
      zIndex: "20",
      bottom: "calc(100% + var(--perch-space-2))",
      // Anchored to its right edge, because the bar puts its buttons on the
      // right and a menu opening rightward from one of them runs off the
      // window — measured at 1280 wide, 25px past it.
      right: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      minWidth: "10rem",
      padding: "2",
      gap: "1",
      background: "surface",
      border: "1px solid var(--perch-border)",
      borderRadius: "var(--perch-space-2)",
      boxShadow: "popover",
    },

    /**
     * Its own card rather than a lid on the table's. Seaming the two meant a
     * rule that only holds while nothing comes between them — and something
     * does: the failure line is rendered right there, between the filters and
     * the rows, whenever a round trip fails.
     */
    ".perch-list__table": {
      overflowX: "auto",
      background: "surface",
      border: "1px solid var(--perch-border)",
      borderRadius: "lg",
    },

    ".perch-list__failure": { marginBottom: "5", color: "danger-content" },

    /* Each control under its own name. A row of boxes all reading "Any" is
       three identical controls to anybody reading the page by eye. */
    ".perch-list__narrow": { display: "flex", flexDirection: "column", gap: "1" },

    /* The same treatment a field's label gets, because it is the same thing:
       the name of the control under it. */
    ".perch-list__narrow-name": {
      color: "content-muted",
      fontSize: "sm",
      fontWeight: "600",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
    },

    /**
     * Two dates under one name, laid along the row rather than stacked, so the
     * pair reads as one control and the bar keeps its height.
     *
     * Two cells of the bar, for the reason the schema filter takes two: the bar
     * hands every filter one cell sized for one control, and this holds two
     * with a dash between. Sharing one cell left each box at about 79px, under
     * what a native date control needs — so the browser clipped it, taking the
     * calendar button off the end and leaving no way to open the picker by
     * clicking.
     *
     * Room to sit at their own width, not to be stretched across. The trailing
     * `1fr` is what keeps them their own size: with a track to take the free
     * space, the three that hold something size to what they hold.
     */
    ".perch-list__range": {
      gridColumn: "span 2",
      display: "grid",
      gridTemplateAreas: '"name name name name" "from dash to ."',
      gridTemplateColumns: "auto auto auto 1fr",
      alignItems: "center",
      gap: "var(--perch-space-1) var(--perch-space-2)",
      minWidth: "0",
      padding: "0",
      border: "0",
      _narrow: { gridColumn: "1 / -1" },
    },

    ".perch-list__range > .perch-list__narrow-name": { gridArea: "name" },

    ".perch-list__range-end": { display: "block", minWidth: "0" },

    ".perch-list__range-end:first-of-type": { gridArea: "from" },

    ".perch-list__range-end:last-of-type": { gridArea: "to" },

    ".perch-list__range-end > .perch-control": { width: "100%" },

    ".perch-list__range-to": { gridArea: "dash", color: "content-muted" },

    /* The pager and the page size on one line: they are the same question asked
       two ways, and a reader looking for one finds the other. */
    ".perch-list__foot": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "4",
      flexWrap: "wrap",
    },

    ".perch-list__size": {
      display: "inline-flex",
      alignItems: "center",
      gap: "2",
      marginLeft: "auto",
      fontSize: "sm",
      color: "content-muted",
    },

    ".perch-layout--fieldset": {
      minWidth: "0",
      margin: "0",
      padding: "var(--perch-space-4) var(--perch-space-5) var(--perch-space-5)",
      border: "1px solid var(--perch-border)",
      borderRadius: "md",
    },

    ".perch-layout__legend": {
      display: "flex",
      alignItems: "center",
      gap: "2",
      paddingInline: "2",
      color: "content-muted",
      fontSize: "sm",
      fontWeight: "600",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
    },

    /* Under the title, above what the layout holds. */
    ".perch-layout__description": {
      margin: "0 0 var(--perch-space-4)",
      color: "content-secondary",
      fontSize: "control",
    },

    /**
     * A box that says something. Bordered on the leading edge rather than
     * filled edge to edge: a panel of coloured blocks stops meaning anything,
     * and the stripe reads as a tone at a glance without competing with the
     * fields inside.
     */
    ".perch-layout--callout": {
      padding: "var(--perch-space-4) var(--perch-space-5)",
      border: "1px solid var(--perch-border)",
      borderInlineStart: "3px solid var(--perch-content-muted)",
      borderRadius: "md",
      background: "surface",
    },

    /**
     * The tone on the stripe and on the words, never on the whole box: a filled
     * panel behind a form's fields fights the controls it is warning about.
     * Both, not the stripe alone — colour is not the only thing carrying it,
     * but it should not be the only thing carrying it twice either.
     */
    '.perch-layout--callout[data-tone="success"]': {
      borderInlineStartColor: "success-content",
      background: "success-surface",
    },
    '.perch-layout--callout[data-tone="warning"]': {
      borderInlineStartColor: "warning-content",
      background: "warning-surface",
    },
    '.perch-layout--callout[data-tone="danger"]': {
      borderInlineStartColor: "danger-content",
      background: "danger-surface",
    },

    /* Its own line of prose is the point of it, not an aside under a title. */
    ".perch-layout--callout .perch-layout__description": {
      marginBottom: "0",
      color: "content",
    },

    /* Only where it holds something: an empty body would push the box open. */
    ".perch-layout--callout .perch-layout__body:not(:empty)": { marginTop: "4" },

    /**
     * Below the width two fields need to be worth reading side by side, the
     * declaration stops being an instruction and becomes a wish. A count of
     * three honoured on a phone is three fields of eleven characters each, and
     * a date picker that cannot show a date — so the layout collapses and the
     * declaration goes back to meaning what it meant: these belong together.
     *
     * Closer together once stacked, too: the gap that separated columns reads
     * as a gap between unrelated things when everything is one column.
     */
    ".perch-layout__body": {
      display: "grid",
      gridTemplateColumns: "repeat(var(--perch-columns, 1), minmax(0, 1fr))",
      gap: "7",
      _narrow: { gridTemplateColumns: "minmax(0, 1fr)", gap: "5" },
    },

    /* `hidden` is `display: none` in the browser's own sheet, and a class beats
       it: the browser's sheet is a weaker origin than any author rule, layered
       or not. Without this the attribute is set, the arrow turns, and nothing
       moves. */
    ".perch-layout__body[hidden]": { display: "none" },

    /* A section is a card: it is the unit a reader scans by, and on a flat page
       the fields ran together into one long list with headings floating in it.
       The gap between cards is a step coarser than the gap between fields
       inside one, so the grouping reads before the content does. */
    ".perch-layout--section": {
      padding: "8",
      background: "surface",
      borderRadius: "lg",
      // Lifted rather than outlined: a border was the only thing separating
      // this from the page, and every other rectangle had the same one.
      boxShadow: "raised",
    },

    ".perch-layout--schema > .perch-layout__body": { gap: "9" },

    /* The whole heading is the control where a section folds: a title beside a
       small arrow is a target most people aim at and miss. */
    ".perch-layout__title--folds:focus-visible": {
      outline: "none",
      borderRadius: "md",
      // The panel's own ring rather than the browser's. A default outline drawn
      // around something the width of the card reads as an error box, which is
      // what it looked like.
      boxShadow: "focus-ring",
    },

    /* A row of a mark and some words is what a title already is; what the
       button adds is filling its line and looking like nothing. */
    ".perch-layout__title--folds": {
      width: "100%",
      padding: "0",
      border: "0",
      background: "none",
      font: "inherit",
      color: "inherit",
      textAlign: "left",
      cursor: "pointer",
    },

    /* Beside the words, never in their place: it is hidden from a screen
       reader. */
    ".perch-layout__caret": { color: "content-subtle" },

    ".perch-layout__title": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      marginBottom: "5",
      fontSize: "control",
      fontWeight: "500",
      color: "content",
    },

    /* Only where the card gives it an edge to sit against. A layout with no
       surface of its own has nothing for the rule to divide. */
    ".perch-layout--section > .perch-layout__title": {
      margin: "0 0 var(--perch-space-7)",
      paddingBottom: "5",
      borderBottom: "1px solid var(--perch-border-subtle)",
      fontSize: "lg",
      fontWeight: "600",
    },

    /* A folded section is its heading and nothing else. The rule above divides
       the heading from what follows, and the space under it is for what
       follows — with the body gone, both leave a card with a hole in it. */
    ".perch-layout--section:has(> .perch-layout__body[hidden]) > .perch-layout__title":
      { marginBottom: "0", paddingBottom: "0", borderBottom: "0" },

    ".perch-entry": {
      display: "flex",
      alignItems: "center",
      minHeight: "control-height",
      margin: "0",
      color: "content",
      fontSize: "control",
      // The value keeps its line; the button sits at the end of it.
      gap: "2",
    },

    /* Nothing there, said plainly rather than left as a blank line to puzzle
       over. */
    '.perch-entry[data-empty="true"]': { color: "content-secondary" },

    /* The mark an infolist shows in place of a word. Sized like the words it
       stands among, so a column of entries keeps one rhythm whether a row reads
       as a sentence or as a shape. */
    ".perch-entry__mark": { fontSize: "control" },

    '.perch-entry__mark[data-tone="success"]': { color: "success-content" },
    '.perch-entry__mark[data-tone="warning"]': { color: "warning-content" },
    '.perch-entry__mark[data-tone="danger"]': { color: "danger-content" },

    /**
     * Carried over as it stands, and worth a reader's attention: `flex-wrap`
     * and the gap below both need a flex container, and nothing here declares
     * `display` on this element. Both are therefore inert. Left exactly as
     * found — a port preserves, and a suspected fault in what it preserves is
     * reported rather than quietly repaired.
     */
    ".perch-entry__pictures": { flexWrap: "wrap" },

    ".perch-entry__picture": {
      width: "var(--perch-picture, 40px)",
      height: "var(--perch-picture, 40px)",
      flex: "none",
      objectFit: "cover",
      borderRadius: "md",
      background: "surface-muted",
    },

    '.perch-entry__picture[data-circular="true"]': { borderRadius: "50%" },

    /* Overlapping rather than in a line: it says "these belong together and
       there are this many" in the width of about two. The ring is what keeps
       the one behind from reading as a smudge on the one in front. */
    '.perch-entry__pictures[data-stacked="true"]': { gap: "0" },

    '.perch-entry__pictures[data-stacked="true"] .perch-entry__picture + .perch-entry__picture':
      { marginLeft: "calc(var(--perch-picture, 40px) / -3)" },

    '.perch-entry__pictures[data-stacked="true"] .perch-entry__picture': {
      boxShadow: "0 0 0 2px var(--perch-surface)",
    },

    ".perch-entry__colour": { display: "inline-flex", alignItems: "center", gap: "2" },

    ".perch-entry__swatch": {
      flex: "none",
      width: "16px",
      height: "16px",
      // A border, so a colour the same as the page still reads as a patch and
      // not as a gap where one failed to draw.
      border: "1px solid var(--perch-border)",
      borderRadius: "sm",
    },

    ".perch-entry__code": { fontFamily: "mono" },

    ".perch-entry__link": {
      color: "accent",
      textDecoration: "underline",
      textUnderlineOffset: "2px",
    },

    /* Quiet until wanted. A copy button beside every value on a dense page is a
       column of icons competing with the values themselves. */
    ".perch-entry__copy": {
      flex: "none",
      padding: "0 var(--perch-space-1)",
      border: "0",
      background: "none",
      color: "content-subtle",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 120ms ease",
      _motionReduce: { transition: "none" },
    },

    ".perch-entry:hover .perch-entry__copy, .perch-entry__copy:focus-visible": {
      opacity: "1",
    },

    /* A colour without a pill colours the words. The same four names either
       way. */
    '.perch-entry[data-tone="success"]': { color: "success-content" },
    '.perch-entry[data-tone="warning"]': { color: "warning-content" },
    '.perch-entry[data-tone="danger"]': { color: "danger-content" },
    '.perch-entry[data-tone="neutral"]': { color: "content-secondary" },

    ".perch-rich": {
      display: "flex",
      flexDirection: "column",
      minWidth: "0",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      background: "surface",
      overflow: "hidden",
    },

    ".perch-rich:focus-within": { borderColor: "accent", boxShadow: "focus-ring" },

    '.perch-rich[data-disabled="true"]': {
      borderColor: "border",
      background: "surface-muted",
    },

    /* A document this editor cannot draw. Not an empty page: an empty page over
       a document that exists is the mistake, not the fix. */
    ".perch-rich--unreadable": { borderStyle: "dashed", background: "surface-muted" },

    ".perch-rich__notice": {
      margin: "0",
      padding: "5",
      color: "content-secondary",
      fontSize: "control",
      lineHeight: "1.5",
    },

    /* The height a resting editor takes, so the page does not move when the
       chunk carrying it arrives. */
    ".perch-rich--waiting": { minHeight: "140px", background: "surface-muted" },

    ".perch-rich__toolbar": {
      display: "flex",
      flexWrap: "wrap",
      gap: "1",
      padding: "2",
      borderBottom: "1px solid var(--perch-border)",
      background: "surface-muted",
    },

    ".perch-rich__tool": {
      // The pointer target every other control here keeps.
      minWidth: "control-height-sm",
      minHeight: "control-height-sm",
      padding: "0 var(--perch-space-2)",
      border: "1px solid transparent",
      borderRadius: "sm",
      background: "none",
      color: "content-secondary",
      fontSize: "control",
      lineHeight: "1",
      cursor: "pointer",
    },

    ".perch-rich__tool:hover:not(:disabled)": {
      background: "surface-sunken",
      color: "content",
    },

    '.perch-rich__tool[aria-pressed="true"]': {
      borderColor: "accent-border",
      background: "accent-surface",
      color: "accent",
    },

    ".perch-rich__tool:focus-visible": {
      outline: "none",
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    ".perch-rich__tool:disabled": { color: "content-subtle", cursor: "not-allowed" },

    /* Where the address is asked for: on the page, under the buttons, rather
       than in a dialog the browser draws and a sandboxed frame refuses to. */
    ".perch-rich__link": {
      display: "flex",
      gap: "2",
      padding: "2",
      borderBottom: "1px solid var(--perch-border)",
      background: "surface-muted",
    },

    ".perch-rich__address": {
      flex: "1 1 auto",
      minWidth: "0",
      fontFamily: "mono",
    },

    /**
     * The editor's own element. Its ring is the frame's, drawn above.
     *
     * A ceiling of its own, with its own scrollbar. Without one the surface
     * grows with whatever is typed and the page grows under it: the toolbar
     * leaves the screen, and a long note is written with its buttons somewhere
     * above. The frame around this clips rather than scrolls, so anything past
     * the fold could not be reached at all.
     */
    ".perch-rich__page": {
      minHeight: "120px",
      maxHeight: "60vh",
      overflowY: "auto",
      padding: "5",
      color: "content",
      fontSize: "control",
      lineHeight: "1.6",
      outline: "none",
      overflowWrap: "anywhere",
    },

    ".perch-rich__page > * + *": { marginTop: "5" },

    ".perch-rich__page h2": { margin: "0", fontSize: "xl", fontWeight: "600" },

    ".perch-rich__page h3": { margin: "0", fontSize: "lg", fontWeight: "600" },

    ".perch-rich__page p": { margin: "0" },

    ".perch-rich__page ul, .perch-rich__page ol": { margin: "0", paddingLeft: "8" },

    ".perch-rich__page blockquote": {
      margin: "0",
      paddingLeft: "5",
      borderLeft: "2px solid var(--perch-border)",
      color: "content-secondary",
    },

    ".perch-rich__page pre": {
      margin: "0",
      padding: "4",
      borderRadius: "sm",
      background: "surface-sunken",
      fontFamily: "mono",
      overflowX: "auto",
    },

    ".perch-rich__page code": { fontFamily: "mono" },

    ".perch-rich__page a": { color: "accent" },

    ".perch-rich__page hr": {
      margin: "0",
      border: "0",
      borderTop: "1px solid var(--perch-border)",
    },

    ".perch-markdown": {
      display: "flex",
      flexDirection: "column",
      minWidth: "0",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      background: "surface",
      overflow: "hidden",
    },

    ".perch-markdown:focus-within": { borderColor: "accent", boxShadow: "focus-ring" },

    '.perch-markdown[data-disabled="true"]': {
      borderColor: "border",
      background: "surface-muted",
    },

    ".perch-markdown__bar": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "4",
      padding: "2",
      borderBottom: "1px solid var(--perch-border)",
      background: "surface-muted",
    },

    ".perch-markdown__tools": { display: "flex", flexWrap: "wrap", gap: "1" },

    ".perch-markdown__tool": {
      // The pointer target every other control here keeps.
      minWidth: "control-height-sm",
      minHeight: "control-height-sm",
      padding: "0 var(--perch-space-2)",
      border: "1px solid transparent",
      borderRadius: "sm",
      background: "none",
      color: "content-secondary",
      fontSize: "control",
      lineHeight: "1",
      cursor: "pointer",
    },

    ".perch-markdown__tool:hover:not(:disabled)": {
      background: "surface-sunken",
      color: "content",
    },

    ".perch-markdown__tool:focus-visible": {
      outline: "none",
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    ".perch-markdown__tool:disabled": {
      color: "content-subtle",
      cursor: "not-allowed",
    },

    /* Which of the two panels is showing. Named as what they are, so a reader
       reads the one they are on rather than what pressing it would do. */
    ".perch-markdown__panels": { display: "flex", flex: "none", gap: "1" },

    ".perch-markdown__panel": {
      // Twenty-eight pixels, which is also what the small control height is.
      // Left as the number it was: the tool beside it reads the token and this
      // does not, and collapsing the two would be deciding that a tab is a
      // control rather than porting what is here.
      minHeight: "28px",
      padding: "0 var(--perch-space-4)",
      border: "1px solid transparent",
      borderRadius: "sm",
      background: "none",
      color: "content-muted",
      fontSize: "base",
      cursor: "pointer",
    },

    '.perch-markdown__panel[aria-selected="true"]': {
      borderColor: "accent-border",
      background: "accent-surface",
      color: "accent",
    },

    ".perch-markdown__panel:focus-visible": {
      outline: "none",
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    /**
     * A textarea is twenty columns wide until somebody says otherwise, and this
     * one sits in a block parent that will not stretch it — so the frame was
     * the field's and the writing surface was 196px in its corner. Block, too:
     * an inline-block textarea sits on a baseline and leaves a gap under
     * itself. The ceiling is the one its rich counterpart has, for the same
     * reason: a surface that grows without one takes the toolbar off the
     * screen, and `resize` stays so a reader who wants more can have it.
     */
    ".perch-markdown__box": {
      display: "block",
      width: "100%",
      minHeight: "120px",
      maxHeight: "60vh",
      padding: "5",
      border: "0",
      background: "none",
      color: "content",
      fontFamily: "mono",
      fontSize: "control",
      lineHeight: "1.6",
      outline: "none",
      resize: "vertical",
    },

    /* Its spacing matches the rich editor's page, so moving between the two
       fields does not move the text. */
    ".perch-markdown__footer": {
      display: "flex",
      padding: "var(--perch-space-3) var(--perch-space-5)",
      borderTop: "1px solid var(--perch-border)",
    },

    ".perch-markdown__count": {
      marginLeft: "auto",
      fontFamily: "mono",
      fontSize: "sm",
      fontVariantNumeric: "tabular-nums",
      color: "content-muted",
    },

    ".perch-markdown__count--error": { color: "danger-content" },

    ".perch-markdown__preview": {
      minHeight: "120px",
      padding: "5",
      color: "content",
      fontSize: "control",
      lineHeight: "1.6",
      overflowWrap: "anywhere",
    },

    ".perch-markdown__preview > * + *": { marginTop: "5" },

    ".perch-markdown__preview h2": { margin: "0", fontSize: "xl", fontWeight: "600" },

    ".perch-markdown__preview h3": { margin: "0", fontSize: "lg", fontWeight: "600" },

    ".perch-markdown__preview p": { margin: "0" },

    ".perch-markdown__preview ul, .perch-markdown__preview ol": {
      margin: "0",
      paddingLeft: "8",
    },

    ".perch-markdown__preview blockquote": {
      margin: "0",
      paddingLeft: "5",
      borderLeft: "2px solid var(--perch-border)",
      color: "content-secondary",
    },

    ".perch-markdown__preview pre": {
      margin: "0",
      padding: "4",
      borderRadius: "sm",
      background: "surface-sunken",
      fontFamily: "mono",
      overflowX: "auto",
    },

    ".perch-markdown__preview code": { fontFamily: "mono" },

    ".perch-markdown__preview a": { color: "accent" },

    ".perch-markdown__nothing": { margin: "0", color: "content-subtle" },

    ".perch-repeater": {
      overflow: "hidden",
      border: "1px solid var(--perch-border)",
      borderRadius: "lg",
      background: "surface",
    },

    ".perch-repeater__head": {
      display: "flex",
      alignItems: "center",
      gap: "5",
      height: "42px",
      padding: "0 var(--perch-space-7)",
      borderBottom: "1px solid var(--perch-border)",
    },

    ".perch-repeater__title": { fontSize: "lg", fontWeight: "600", color: "content" },

    ".perch-repeater__count": {
      fontFamily: "mono",
      fontSize: "sm",
      color: "content-subtle",
    },

    ".perch-repeater__body": {
      display: "flex",
      flexDirection: "column",
      gap: "4",
      padding: "var(--perch-space-6) var(--perch-space-7)",
    },

    /* The frame, and the transition that was a second rule: rows step aside
       rather than jump. The dragged one is excluded below — it follows the
       pointer, and a transition on that lags behind the finger. */
    ".perch-repeater__item": {
      border: "1px solid var(--perch-border)",
      borderRadius: "lg",
      background: "surface",
      transition: "transform 160ms cubic-bezier(0.2, 0, 0, 1)",
      _motionReduce: { transition: "none" },
    },

    '.perch-repeater__item[data-invalid="true"]': { borderColor: "danger-border" },

    /* Off the page rather than merely outlined: lifted, above its neighbours,
       and carrying the shadow of something no longer lying flat. */
    '.perch-repeater__item[data-dragging="true"]': {
      position: "relative",
      zIndex: "1",
      transition: "none",
      borderColor: "border-strong",
      boxShadow: "dragging",
      background: "surface-raised",
    },

    '.perch-repeater__item[data-dragging="true"] .perch-repeater__handle': {
      cursor: "grabbing",
    },

    '.perch-repeater__item[data-pending="true"]': {
      borderColor: "pending-border",
      background: "pending-surface",
    },

    /**
     * The line that names a row: its controls at each end, its name between
     * them. As many parts as the field asked for — a fold arrow only where one
     * was declared — so a flex row rather than fixed tracks, which is what the
     * grid before it could not survive.
     */
    ".perch-repeater__line": {
      display: "flex",
      alignItems: "center",
      gap: "5",
      padding: "var(--perch-space-4) var(--perch-space-5)",
    },

    /* Takes what is left between the two ends, and says which row this is.
       Both were separate rules, for the two things a label does. */
    ".perch-repeater__label": {
      flex: "1",
      minWidth: "0",
      overflowWrap: "anywhere",
      fontSize: "control",
      fontWeight: "500",
      color: "content-secondary",
    },

    /* The fields below the line, one per column the row declares. Folding takes
       their height and leaves the line, which is how a folded row stays
       findable — and it keeps the row's width, not its place in the grid. */
    ".perch-repeater__fields": {
      display: "grid",
      gap: "6",
      padding: "0 var(--perch-space-5) var(--perch-space-5)",
      minWidth: "0",
    },

    /* `hidden` is `display: none` in the browser's own sheet, and a class beats
       it — the browser's sheet is a weaker origin than any author rule, layered
       or not. Without this the attribute is set, the arrow turns, and nothing
       moves. The layout's own half of this rule stays where it is until that
       surface moves. */
    ".perch-repeater__fields[hidden]": { display: "none" },

    ".perch-repeater__fold": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "24px",
      minHeight: "24px",
      alignSelf: "start",
      border: "none",
      background: "none",
      color: "content-subtle",
      cursor: "pointer",
    },

    ".perch-repeater__fold:hover": { color: "content" },

    /* A grip that can be dragged says so under the pointer, and stops the
       browser turning the gesture into a text selection or a scroll. */
    ".perch-repeater__handle": {
      cursor: "grab",
      touchAction: "none",
      userSelect: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "24px",
      minHeight: "24px",
      gap: "1px",
      border: "none",
      background: "none",
      color: "content-subtle",
    },

    ".perch-repeater__handle:focus-visible": {
      outline: "none",
      borderRadius: "sm",
      boxShadow: "focus-ring",
    },

    ".perch-repeater__index": { fontFamily: "mono", fontSize: "xs" },

    /* Pushed to the end, and never shrunk: three buttons at 28 px with 6 px
       between them need 96 px, and a flex item that may shrink gives that up
       first. Asserted in target-size.test.ts. */
    ".perch-repeater__actions": {
      display: "flex",
      gap: "3",
      justifyContent: "flex-end",
      marginLeft: "auto",
      flex: "none",
    },

    ".perch-repeater__note": {
      minHeight: "help-line",
      padding: "0 var(--perch-space-5) var(--perch-space-4) 50px",
      fontSize: "base",
      color: "content-muted",
      textWrap: "pretty",
    },

    '.perch-repeater__note[data-error="true"]': { color: "danger-content" },

    ".perch-repeater__dropzone": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4",
      height: "40px",
      border: "1px dashed var(--perch-border-strong)",
      borderRadius: "lg",
      background: "surface-muted",
      fontSize: "base",
      color: "content-muted",
    },

    ".perch-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "var(--perch-space-1) var(--perch-space-3)",
      borderRadius: "var(--perch-space-1)",
      fontSize: "sm",
      fontWeight: "600",
    },

    ".perch-badge--success": {
      color: "success-content",
      background: "success-surface",
    },

    ".perch-badge--neutral": {
      color: "content-secondary",
      background: "surface-skeleton-strong",
    },

    ".perch-badge--warning": {
      color: "warning-content",
      background: "warning-surface",
    },

    ".perch-badge--danger": {
      color: "danger-content",
      background: "danger-surface",
    },

    ".perch-form-actions": {
      display: "flex",
      alignItems: "center",
      gap: "5",
      marginTop: "9",
      padding: "var(--perch-space-6) var(--perch-space-8)",
      background: "surface",
      border: "1px solid var(--perch-border)",
      borderRadius: "lg",
    },

    ".perch-form-actions__status": { fontSize: "base", color: "content-muted" },

    /**
     * The modal, and the footer it reaches into.
     *
     * Both surfaces move together, and they had to. The modal overrides
     * `.perch-form-actions` twice — a footer inside a dialog is already on a
     * surface, so it drops its own card — and that override is two classes
     * against one. Specificity settles it only while both sit in the same
     * cascade origin. Moving the modal alone would have put its override in a
     * layer and left the footer's own rule unlayered, which beats every layer
     * however specific: the footer would have grown its card back inside every
     * dialog, and nothing would have said so.
     */
    /* The platform's own element, opened with `showModal()`. The focus trap,
       the Escape key and painting above everything else come with it. */
    ".perch-modal": {
      maxWidth: "min(28rem, calc(100vw - var(--perch-space-8) * 2))",
      padding: "0",
      border: "1px solid var(--perch-border)",
      borderRadius: "lg",
      background: "surface",
      color: "content",
      // It came from somewhere and it will go away, which is what the deepest
      // step in the scale is for.
      boxShadow: "overlay",
    },

    /* A question fits in a sentence; a form does not. `width`, not
       `max-width`: a dialog shrinks to its content, and a form whose fields
       are as wide as their placeholders is not a form anybody wants. */
    '.perch-modal[data-form="true"]': {
      width: "min(34rem, calc(100vw - var(--perch-space-8) * 2))",
    },

    /* A declared width, which wins over the one the content implies. Ceilings
       rather than widths: each is the smaller of its own size and what the
       window has, so the largest is still a panel on a phone and not a page
       that scrolls sideways. */
    ".perch-modal[data-width]": {
      width: "min(var(--perch-modal-width), calc(100vw - var(--perch-space-8) * 2))",
      maxWidth: "none",
    },

    '.perch-modal[data-width="sm"]': { "--perch-modal-width": "24rem" },
    '.perch-modal[data-width="md"]': { "--perch-modal-width": "28rem" },
    '.perch-modal[data-width="lg"]': { "--perch-modal-width": "32rem" },
    '.perch-modal[data-width="xl"]': { "--perch-modal-width": "36rem" },
    '.perch-modal[data-width="2xl"]': { "--perch-modal-width": "42rem" },
    '.perch-modal[data-width="3xl"]': { "--perch-modal-width": "48rem" },
    '.perch-modal[data-width="4xl"]': { "--perch-modal-width": "56rem" },
    '.perch-modal[data-width="5xl"]': { "--perch-modal-width": "64rem" },
    '.perch-modal[data-width="6xl"]': { "--perch-modal-width": "72rem" },
    '.perch-modal[data-width="7xl"]': { "--perch-modal-width": "80rem" },

    /* The one that is not a ceiling. `screen` is the window, so the margin the
       others keep would be a promise it is not making. */
    '.perch-modal[data-width="screen"]': {
      width: "100vw",
      maxWidth: "100vw",
      height: "100vh",
      maxHeight: "100vh",
      borderRadius: "0",
    },

    /* Against the side rather than in the middle. The dialog is still the
       dialog — `showModal()` gives the focus trap, the Escape key and the inert
       background whatever this does with the box. */
    '.perch-modal[data-slide-over="true"]': {
      margin: "0 0 0 auto",
      height: "100dvh",
      maxHeight: "100dvh",
      borderRadius: "0",
      borderWidth: "0 0 0 1px",
    },

    '.perch-modal[data-slide-over="true"] .perch-modal__panel': {
      height: "100%",
      overflowY: "auto",
    },

    /* A full-height panel puts its footer at the foot of it. Left alone the
       fields sit at the top and the button lands halfway up an empty column,
       which reads as a panel that failed to finish rather than one with room
       to spare. */
    '.perch-modal[data-slide-over="true"] .perch-modal__panel > form': {
      display: "flex",
      flex: "1",
      flexDirection: "column",
      minHeight: "0",
    },

    '.perch-modal[data-slide-over="true"] .perch-form-actions': { marginTop: "auto" },

    /* Only where the reader has not asked for less. A panel arriving from off
       screen is motion, and motion is a thing some people have told their
       machine they do not want. */
    '.perch-modal[data-slide-over="true"][open]': {
      _motionSafe: { animation: "perch-slide-in 180ms ease-out" },
    },

    /* The footer is a card on a page, where it sits on the page ground. Inside
       a dialog it is already on a surface, and a second one reads as a box in a
       box. */
    ".perch-modal .perch-form-actions": {
      marginTop: "6",
      padding: "var(--perch-space-6) 0 0",
      background: "none",
      border: "0",
      borderTop: "1px solid var(--perch-border-subtle)",
      borderRadius: "0",
    },

    ".perch-modal::backdrop": { background: "overlay-scrim" },

    ".perch-modal__panel": {
      display: "flex",
      flexDirection: "column",
      gap: "5",
      padding: "8",
      // Scrolls rather than spills. A dialog is capped at the viewport by the
      // browser's own stylesheet, so a panel taller than that was clipped and
      // the rest could not be reached at all.
      maxHeight: "calc(100dvh - var(--perch-space-8) * 2)",
      overflowY: "auto",
    },

    ".perch-modal__bar": {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "4",
    },

    /**
     * A dialog holding a form ignores a click on the backdrop on purpose, so
     * this and Escape are the only ways out of one — and a touch screen has no
     * Escape. On a phone a slide-over fills the window and takes the backdrop
     * with it, which leaves this corner as the only thing left to press. So the
     * coarse-pointer floor is the AAA target rather than the AA one: being the
     * only way out earns it.
     */
    ".perch-modal__close": {
      flex: "none",
      // The pointer target every other control here keeps.
      minWidth: "24px",
      minHeight: "24px",
      padding: "0",
      border: "0",
      background: "none",
      color: "content-secondary",
      fontSize: "lg",
      lineHeight: "1",
      cursor: "pointer",
      _pointerCoarse: { minWidth: "44px", minHeight: "44px" },
    },

    ".perch-modal__close:hover:not(:disabled)": { color: "content" },

    ".perch-modal__close:disabled": { cursor: "not-allowed", opacity: "0.5" },

    ".perch-modal__heading": {
      margin: "0",
      fontSize: "xl",
      fontWeight: "600",
      textWrap: "balance",
    },

    ".perch-modal__description": {
      margin: "0",
      fontSize: "control",
      color: "content-muted",
      textWrap: "pretty",
    },

    /* The confirming button last, where the eye ends up, and after the way out. */
    ".perch-modal__actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: "4",
      marginTop: "3",
    },

    ".perch-button": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "3",
      height: "control-height-sm",
      padding: "0 var(--perch-space-5)",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      background: "surface",
      color: "content",
      fontFamily: "sans",
      fontSize: "base",
      cursor: "pointer",
      // The list page's create action is an anchor: it goes somewhere, so it
      // says so honestly, and then it has to stop underlining itself.
      textDecoration: "none",
    },

    ".perch-button:hover": { background: "surface-muted" },

    /**
     * One rule for the two ways a button says it cannot be used.
     *
     * `aria-disabled` keeps it in the tab order, so the focus a reader is
     * holding does not fall to the body, and `data-disabled` is what the
     * stylesheet reads — the pair the control uses.
     *
     * Both weigh the same as each other and more than a modifier: a class plus
     * a pseudo-class, or a class plus an attribute, against a modifier's single
     * class. So a disabled primary or danger button looks disabled wherever
     * this sits. That argument survives the move because every rule it compares
     * moved with it — between two rules in one layer, specificity still
     * decides.
     */
    '.perch-button:disabled, .perch-button[data-disabled="true"]': {
      color: "content-muted",
      background: "surface-muted",
      cursor: "not-allowed",
    },

    ".perch-button:focus-visible": {
      outline: "none",
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    ".perch-button--primary": {
      borderColor: "accent",
      background: "accent",
      color: "content-inverse",
      fontWeight: "500",
    },

    ".perch-button--primary:hover": {
      background: "accent-hover",
      borderColor: "accent-hover",
    },

    ".perch-button--icon": {
      // A width alone is only a preference to a flex item.
      flex: "none",
      width: "control-height-sm",
      padding: "0",
      borderColor: "border",
      color: "content-muted",
    },

    ".perch-button--icon:hover": { color: "content" },

    ".perch-button--danger": {
      borderColor: "danger-border",
      color: "danger",
    },

    ".perch-button--danger:hover": { background: "danger-surface" },

    ".perch-control": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      minWidth: "0",
      height: "control-height",
      padding: "0 var(--perch-space-5)",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      backgroundColor: "surface",
      color: "content",
      fontFamily: "sans",
      fontSize: "control",
      transition: "border-color 120ms ease, box-shadow 120ms ease",

      '&:hover:not([data-disabled="true"]):not([data-readonly="true"])': {
        borderColor: "border-hover",
        backgroundColor: "surface-raised",
      },

      // `:focus-within` rather than `:focus`, so the wrapper lights up for the
      // inner input, the combobox trigger and the segmented date control alike.
      "&:focus-within": {
        borderColor: "accent",
        boxShadow: "focus-ring",
        outline: "none",
      },

      "&:focus-within .perch-select__chevron": { color: "accent" },

      '&[data-state="draft"]': {
        borderColor: "accent",
        backgroundColor: "accent-surface",
      },
      '&[data-invalid="true"]': { borderColor: "danger" },
      '&[data-disabled="true"], &[data-readonly="true"]': {
        borderColor: "border",
        backgroundColor: "surface-muted",
        color: "content-muted",
      },
      '&[data-empty="true"]': {
        borderStyle: "dashed",
        backgroundColor: "surface-muted",
        color: "content-subtle",
      },
    },

    ".perch-control--mono .perch-control__input": {
      fontFamily: "mono",
      fontVariantNumeric: "tabular-nums",
    },

    ".perch-control--tracked": { position: "relative", overflow: "hidden" },

    /* The control owns the frame; the input is transparent inside it. Border
       and ring live in one place, so every field type lines up to the pixel. */
    ".perch-control__input": {
      flex: "1 1 auto",
      minWidth: "0",
      height: "100%",
      border: "none",
      padding: "0",
      background: "none",
      color: "inherit",
      font: "inherit",
      outline: "none",

      "&::placeholder": { color: "content-subtle" },
      "&:disabled": { cursor: "not-allowed" },
      '&[data-mono="true"]': {
        fontFamily: "mono",
        fontVariantNumeric: "tabular-nums",
      },
    },

    /* Affixes: a fixed scheme, a unit, a verification mark. Part of the frame
       and not of the value — they are never typed into. */
    ".perch-control__affix": {
      display: "flex",
      alignItems: "center",
      // Only ever between the two, so an affix that is words alone — which is
      // most of them — is spaced exactly as it was.
      gap: "2",
      alignSelf: "stretch",
      flex: "none",
      padding: "0 var(--perch-space-4)",
      fontFamily: "mono",
      fontSize: "sm",
      color: "content-muted",
      background: "surface-muted",
    },

    ".perch-control__affix--prefix": {
      marginLeft: "calc(-1 * var(--perch-space-5))",
      borderRight: "1px solid var(--perch-border)",
      borderTopLeftRadius: "calc(var(--perch-radius) - 1px)",
      borderBottomLeftRadius: "calc(var(--perch-radius) - 1px)",
    },

    ".perch-control__affix--suffix": {
      marginRight: "calc(-1 * var(--perch-space-5))",
      marginLeft: "auto",
      borderLeft: "1px solid var(--perch-border)",
      borderTopRightRadius: "calc(var(--perch-radius) - 1px)",
      borderBottomRightRadius: "calc(var(--perch-radius) - 1px)",
    },

    ".perch-control__affix--ok": {
      background: "accent-surface",
      borderColor: "accent-border",
      color: "accent",
    },

    ".perch-control__affix--button": {
      background: "surface-muted",
      border: "none",
      borderLeft: "1px solid var(--perch-border)",
      color: "content-muted",
      cursor: "pointer",
      fontFamily: "mono",
      fontSize: "sm",

      "&:hover": { color: "content" },
    },

    /* Status marks: Unsaved, Saving…, and the error badge. */
    ".perch-control__mark": {
      flex: "none",
      marginLeft: "auto",
      fontSize: "sm",
      fontWeight: "600",
      color: "content-muted",
      whiteSpace: "nowrap",
    },

    ".perch-control__mark--draft": { color: "accent" },

    ".perch-control__mark--error": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      borderRadius: "md",
      background: "danger",
      color: "content-inverse",
      fontSize: "sm",
      fontWeight: "700",
    },

    /* The round-trip hairline. Three pixels inside the control's own frame, so
       showing it costs no layout — the field does not grow when a patch is in
       flight. */
    ".perch-control__track": {
      position: "absolute",
      inset: "auto 0 0 0",
      height: "3px",
      background: "surface-skeleton-strong",
      overflow: "hidden",

      '&[data-state="draft"]': { background: "accent-border" },
    },

    ".perch-control__track-fill": {
      height: "100%",
      background: "border-strong",
      transition: "width 160ms ease",
    },

    ".perch-control__track-fill--draft": { background: "accent" },

    ':where(:root), :where([data-perch-theme="light"])': ramp(0),
    ':where([data-perch-theme="dark"])': ramp(1),

    /**
     * The shell every field lives in.
     *
     * Not a field itself — a label row, a control and a line held under it for
     * whatever the server says about the value. That reserved line is the
     * design, and it is why a field is the same height at rest, in flight and
     * in error: a patch from the server never moves what is below it.
     *
     * One rule about it is written elsewhere and stays there: the view page
     * closes the reserved line where it holds nothing, because a page that only
     * reads has no errors coming. It is rooted in `.perch-view`, carries more
     * than anything here, and keeps winning.
     */
    /* ---------------------------------------------------------------- field shell

       The heart of the design, stated in its own header: help text and error share
       one reserved line under the control, so a field is exactly as tall at rest, in
       flight and in error. A server patch therefore never shifts what is below it —
       which is the visual half of "the state is authoritative on the server". */
    ".perch-field": {
      display: "flex",
      flexDirection: "column",
      gap: "3",
      minWidth: "0",
    },

    ".perch-field__label": {
      display: "flex",
      alignItems: "baseline",
      gap: "3",
    },

    /* At the far end of the label row. `margin-left: auto` rather than
       `justify-content`, so the label and any tag stay where they were. */
    ".perch-field__hint": {
      marginLeft: "auto",
      display: "flex",
      /* Centred, not on the baseline: a drawn mark has no baseline worth aligning
         to, and a flex item without one is laid out by its bottom edge — which put
         the mark low against words it is supposed to sit beside. */
      alignItems: "center",
      gap: "1",
      fontSize: "sm",
      color: "content-muted",
      textAlign: "right",
    },

    ".perch-field__hint-icon": {
      fontSize: "base",
    },

    ".perch-field__label-text": {
      fontSize: "sm",
      fontWeight: "600",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      color: "content-muted",
    },

    ".perch-field__required": {
      color: "danger",
      fontWeight: "600",
    },

    ".perch-field__tag": {
      fontFamily: "mono",
      fontSize: "xs",
      letterSpacing: "0.06em",
      color: "content-subtle",
    },

    /* Never `display: none` and never conditional height: the line is always here. */
    ".perch-field__help": {
      fontSize: "base",
      color: "content-muted",
      minHeight: "help-line",
      textWrap: "pretty",
    },

    '.perch-field__help[data-error="true"]': {
      color: "danger-content",
    },

    /* The control's own line, where something may stand beside it.

       Not around the whole field: a field is a label row, a control and a reserved
       line for the error, so a button placed around all three could only align to
       the bottom of the last one — which put it 22px under the control it belongs
       to. Tops, because both start where the control starts. */
    ".perch-field__row": {
      display: "flex",
      alignItems: "flex-start",
      gap: "2",
    },

    ".perch-field__row > :first-child": {
      flex: "1 1 auto",
      minWidth: "0",
    },

    /* `.inlineLabel()` puts the label beside the control, which is how a checkbox
       reads: the label is the thing being agreed to, not a heading over it. The help
       line below stays where it is, so nothing under the field moves. */
    '.perch-field[data-inline="true"]': {
      display: "grid",
      gridTemplateColumns: "auto 1fr",
      alignItems: "center",
      columnGap: "4",
    },

    '.perch-field[data-inline="true"] .perch-field__label': {
      order: "2",
      margin: "0",
    },

    /* A label beside its control is the thing being agreed to — "On call this week"
       — so it is set as running text. Uppercase micro-caps are for a heading over a
       field, and beside a checkbox they read as shouting. */
    '.perch-field[data-inline="true"] .perch-field__label-text': {
      fontSize: "control",
      fontWeight: "400",
      letterSpacing: "normal",
      textTransform: "none",
      color: "content",
    },

    '.perch-field[data-inline="true"] .perch-field__help': {
      /* After the label, not before it. `order` defaults to 0, so a help line left
         at 0 while the label asked for 2 was placed first — and, spanning both
         columns, it opened a new row that pushed the label under the control. */
      order: "3",
      gridColumn: "1 / -1",
    },

    /**
     * The third surface somebody writes into.
     *
     * A frame that holds the control, a footer under it and a count in the
     * corner — the frame carries the focus ring because the input inside it
     * draws none, which is what lets the footer sit inside the same border.
     *
     * Its ceiling is conditional: `field-sizing` lets the browser grow the box
     * during layout, so nothing measures on keystroke, and `max-height` is what
     * stops that growing past the fold. Only the autosizing one needs it, which
     * is why the two are separate rules rather than one.
     */
    /* ------------------------------------------------------------------ textarea */
    ".perch-textarea": {
      display: "flex",
      flexDirection: "column",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      background: "surface",
      transition: "border-color 120ms ease, box-shadow 120ms ease",
    },

    ".perch-textarea:focus-within": {
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    '.perch-textarea[data-state="draft"]': {
      borderColor: "accent",
      background: "accent-surface",
    },

    '.perch-textarea[data-invalid="true"]': {
      borderColor: "danger",
    },

    '.perch-textarea[data-readonly="true"]': {
      borderColor: "border",
      background: "surface-muted",
    },

    ".perch-textarea__input": {
      /* Stated rather than inherited from a flex parent that happens to stretch it:
         a textarea's own width is 20 columns, and that should not depend on the box
         it was put in. */
      width: "100%",
      minHeight: "96px",
      padding: "var(--perch-space-4) var(--perch-space-5)",
      border: "none",
      background: "none",
      color: "content",
      fontFamily: "sans",
      fontSize: "control",
      lineHeight: "1.5",
      resize: "vertical",
      outline: "none",
      textWrap: "pretty",
    },

    ".perch-textarea__input::placeholder": {
      color: "content-subtle",
    },

    '.perch-textarea[data-readonly="true"] .perch-textarea__input': {
      color: "content-secondary",
      resize: "none",
    },

    /* The browser sizes it during layout, so there is no measuring on keystroke
       and nothing to redo when a value arrives from the server. `rows` stays the
       floor, and where this is unsupported it is the whole answer. */
    '.perch-textarea__input[data-autosize="true"]': {
      fieldSizing: "content",
      maxHeight: "60vh",
    },

    ".perch-textarea__footer": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      padding: "var(--perch-space-3) var(--perch-space-5)",
      borderTop: "1px solid var(--perch-border)",
    },

    '.perch-textarea[data-state="draft"] .perch-textarea__footer': {
      borderTopColor: "accent-border",
    },

    '.perch-textarea[data-invalid="true"] .perch-textarea__footer': {
      borderTopColor: "danger-border",
      background: "danger-surface",
    },

    ".perch-textarea__status": {
      fontSize: "sm",
      fontWeight: "600",
      color: "accent",
    },

    ".perch-textarea__status--error": {
      color: "danger-content",
    },

    ".perch-textarea__status--muted": {
      fontWeight: "600",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "content-muted",
    },

    ".perch-textarea__count": {
      marginLeft: "auto",
      fontFamily: "mono",
      fontSize: "sm",
      fontVariantNumeric: "tabular-nums",
      color: "content-muted",
    },

    ".perch-textarea__count--error": {
      color: "danger-content",
    },

    /**
     * The switch field, and the choice group that wears buttons.
     *
     * Two surfaces rather than one. `.perch-toggle` is a Radix switch with a
     * knob; `.perch-toggles` is a native radio group drawn as a segmented
     * control, and `ChoiceGroup` draws it from the same markup it draws
     * `.perch-radio` from. Nothing reaches into either from outside and no rule
     * names both looks, so they move without the dot look following.
     */
    /* -------------------------------------------------------------------- toggle

       Commits at 0 ms. The knob moves immediately and does not return unless the
       server refuses; the hairline under the row marks the round trip. */
    ".perch-toggle-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: "6",
    },

    /* 24 px, not the design's 22: §2.5.8 target size. Centred because the knob used
       to fill the padding box exactly. */
    ".perch-toggle": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      flex: "none",
      width: "36px",
      height: "24px",
      padding: "1",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "12px",
      background: "surface-skeleton-strong",
      cursor: "pointer",
      transition: "background 120ms ease, border-color 120ms ease",
    },

    ".perch-toggle:focus-visible": {
      outline: "none",
      boxShadow: "focus-ring",
      borderColor: "accent",
    },

    '.perch-toggle[data-state="checked"]': {
      background: "accent",
      borderColor: "accent",
    },

    '.perch-toggle[data-inflight="true"][data-state="checked"]': {
      background: "var(--perch-accent-track)",
      borderColor: "var(--perch-accent-track-border)",
    },

    ".perch-toggle[data-disabled], .perch-toggle:disabled": {
      cursor: "not-allowed",
      background: "surface-skeleton",
      borderColor: "border",
    },

    '.perch-toggle[data-disabled][data-state="checked"], .perch-toggle:disabled[data-state="checked"]':
      {
        background: "surface-skeleton",
        borderColor: "border",
      },

    ".perch-toggle__knob": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "surface",
      transition: "transform 140ms ease",
      willChange: "transform",
    },

    '.perch-toggle[data-state="checked"] .perch-toggle__knob': {
      transform: "translateX(14px)",
    },

    ".perch-toggle:disabled .perch-toggle__knob": {
      background: "surface-muted",
    },

    /* One of three signs, never the only one: the role says it and the knob's
       position shows it, both of which survive a reader who cannot see colour. */
    '.perch-toggle[data-on-color="success"][data-state="checked"]': {
      borderColor: "success-content",
      background: "success-content",
    },

    '.perch-toggle[data-on-color="danger"][data-state="checked"]': {
      borderColor: "danger",
      background: "danger",
    },

    /* The smallest mark the panel draws: ten pixels inside a sixteen-pixel knob.
       Nothing here places it — the knob is a centring box now, and a drawing that
       brought its own would be a box inside a box the same size. */
    ".perch-toggle__icon": {
      fontSize: "xs",
      color: "content-secondary",
    },

    ".perch-toggle-text": {
      display: "flex",
      flexDirection: "column",
      gap: "1",
      minWidth: "0",
    },

    ".perch-toggle-text__label": {
      display: "flex",
      alignItems: "baseline",
      gap: "4",
      fontSize: "control",
      fontWeight: "500",
      color: "content",
    },

    '.perch-toggle-row[data-disabled="true"] .perch-toggle-text__label': {
      color: "content-muted",
    },

    ".perch-toggle-text__help": {
      fontSize: "base",
      color: "content-muted",
      textWrap: "pretty",
    },

    '.perch-toggle-text__help[data-error="true"]': {
      color: "danger-content",
    },

    /* --------------------------------------------------------- toggle buttons */
    /*
     * A radio group wearing buttons: the same native inputs, taken out of sight
     * rather than out of the tab order, with the label beside each one drawn as the
     * thing the reader presses.
     */
    /*
     * Stacked, one column as wide as the longest choice, so the buttons share a
     * width without taking the whole field: three widths in a column read as an
     * accident rather than as a set, and three full-width bars are a lot of weight
     * for a word each.
     */
    ".perch-toggles": {
      display: "grid",
      gridTemplateColumns: "max-content",
      gap: "3",
      minWidth: "0",
    },

    /* Sharing an edge means standing in a row, whatever was said about inline. */
    '.perch-toggles[data-inline="true"], .perch-toggles[data-grouped="true"]': {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
    },

    '.perch-toggles[data-grouped="true"]': {
      gap: "0",
      /* One block or nothing. Wrapped, the joined edges pull the rows sideways and
         only the first and last are rounded — three overlapping strips where a
         segmented control was. Too narrow to fit, it scrolls as one. */
      flexWrap: "nowrap",
      maxWidth: "100%",
      overflowX: "auto",
    },

    ".perch-toggles__option": {
      display: "flex",
      minWidth: "0",
    },

    /* Out of sight, not out of the layout: `display: none` would take the input
       out of the tab order, and the arrow keys with it. */
    ".perch-toggles__input": {
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      padding: "0",
      overflow: "hidden",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
    },

    ".perch-toggles__label": {
      /* Fills the option it stands in: the column's width when they are stacked,
         and its own words when they are in a row. */
      flex: "1 1 auto",
      display: "inline-flex",
      alignItems: "center",
      /* Centred, because stacked they are as wide as the field. */
      justifyContent: "center",
      height: "control-height",
      padding: "0 var(--perch-space-5)",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "md",
      background: "surface",
      color: "content-secondary",
      fontSize: "control",
      whiteSpace: "nowrap",
      cursor: "pointer",
      transition: "border-color 120ms ease, background 120ms ease, color 120ms ease",
    },

    ".perch-toggles__input:not(:disabled) + .perch-toggles__label:hover": {
      borderColor: "border-hover",
      background: "surface-raised",
      color: "content",
    },

    ".perch-toggles__input:checked + .perch-toggles__label": {
      borderColor: "accent",
      background: "accent-surface",
      color: "accent",
    },

    /* The ring is on the label, because the input it belongs to cannot be seen. */
    ".perch-toggles__input:focus-visible + .perch-toggles__label": {
      borderColor: "accent",
      boxShadow: "focus-ring",
    },

    ".perch-toggles__input:disabled + .perch-toggles__label": {
      borderColor: "border",
      background: "surface-muted",
      color: "content-subtle",
      cursor: "not-allowed",
    },

    /*
     * Joined into one block: the edges between two buttons are one line rather than
     * two, and only the ends of the row are rounded.
     */
    '.perch-toggles[data-grouped="true"] .perch-toggles__option': {
      flex: "none",
    },

    '.perch-toggles[data-grouped="true"] .perch-toggles__option + .perch-toggles__option':
      {
        marginLeft: "-1px",
      },

    '.perch-toggles[data-grouped="true"] .perch-toggles__label': {
      borderRadius: "0",
    },

    '.perch-toggles[data-grouped="true"] .perch-toggles__option:first-child .perch-toggles__label':
      {
        borderStartStartRadius: "md",
        borderEndStartRadius: "var(--perch-radius)",
      },

    '.perch-toggles[data-grouped="true"] .perch-toggles__option:last-child .perch-toggles__label':
      {
        borderStartEndRadius: "var(--perch-radius)",
        borderEndEndRadius: "md",
      },

    /* The chosen one draws both of its edges, so its border is not half covered by
       the neighbour it shares one with. */
    '.perch-toggles[data-grouped="true"] .perch-toggles__input:checked + .perch-toggles__label':
      {
        position: "relative",
        zIndex: "1",
      },

    ".perch-toggles__empty": {
      display: "inline-flex",
      alignItems: "center",
      height: "control-height",
      color: "content-subtle",
      fontSize: "control",
    },

    /**
     * The same choice group, wearing a dot.
     *
     * `ChoiceGroup` draws this and `.perch-toggles` from one markup with two
     * class tables, so the pair above and this are one component seen twice.
     * What differs is where the reader aims: there the label is the button, and
     * here it is a dot beside it with the real input laid over it at nil
     * opacity, which is why focus is drawn on the dot and not on the input.
     */
    ".perch-radio": {
      display: "flex",
      flexDirection: "column",
      gap: "3",
      minHeight: "control-height",
      justifyContent: "center",
    },

    '.perch-radio[data-inline="true"]': {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: "6",
      alignItems: "center",
      /* The block above centres along the main axis to sit a lone column of options
         against a control-height row. Turned sideways that same rule centres the
         options across the page, which is where they were found. */
      justifyContent: "flex-start",
    },

    ".perch-radio__option": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      position: "relative",
    },

    ".perch-radio__input": {
      position: "absolute",
      width: "18px",
      height: "18px",
      margin: "0",
      opacity: "0",
      cursor: "pointer",
    },

    ".perch-radio__input:disabled": {
      cursor: "not-allowed",
    },

    ".perch-radio__dot": {
      display: "inline-flex",
      width: "18px",
      height: "18px",
      flex: "none",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "999px",
      background: "surface",
    },

    ".perch-radio__input:checked + .perch-radio__dot": {
      borderColor: "accent",
      borderWidth: "5px",
    },

    /* The ring follows the invisible input, so focus lands where the reader sees the
       dot rather than nowhere at all. */
    ".perch-radio__input:focus-visible + .perch-radio__dot": {
      outline: "2px solid var(--perch-accent)",
      outlineOffset: "2px",
    },

    ".perch-radio__input:disabled + .perch-radio__dot": {
      borderColor: "border",
      background: "surface-muted",
    },

    ".perch-radio__label": {
      color: "content",
      fontSize: "control",
      cursor: "pointer",
    },

    ".perch-radio__input:disabled ~ .perch-radio__label": {
      color: "content-muted",
      cursor: "not-allowed",
    },

    ".perch-radio__empty": {
      color: "content-subtle",
      fontSize: "control",
    },

    /**
     * The table, its cells and everything drawn inside one.
     *
     * The largest surface by some way, and it moves whole. Splitting one is the
     * mistake the modal taught: half a surface in each sheet means every rule
     * that reaches across the seam is decided by cascade origin rather than by
     * what it carries, and nothing says so.
     *
     * Last in this object, as it was last in the sheet it came from. Three of
     * its rules tie a control rule on specificity — a cell quieting the frame
     * the control draws — and a tie is settled by which is written later, so the
     * order of these two surfaces is load-bearing and not a matter of reading.
     */
    /* Every native control the panel draws, given the one look the rest has.
       Styled rather than replaced: a native select keeps the keyboard behaviour
       and the platform's own picker on a phone. */
    /* A control that already carries its own frame is left alone. A select filter
       is one: it carries the class, so the control's own rules frame it, size it
       and grey it out, and this rule would undo all three. */
    '.perch-list__search select:not(.perch-control), .perch-list__search input:not([type="checkbox"]):not([type="radio"]):not(.perch-control):not(.perch-control__input), .perch-list__size select, .perch-table__cell select':
      {
        height: "control-height",
        padding: "0 var(--perch-space-5)",
        border: "1px solid var(--perch-border-strong)",
        borderRadius: "md",
        backgroundColor: "surface",
        color: "content",
        fontFamily: "sans",
        fontSize: "control",
      },

    ".perch-list__search select:not(.perch-control):hover, .perch-list__size select:hover, .perch-table__cell select:hover":
      {
        borderColor: "border-hover",
      },

    /* The same ring every other control answers focus with. A browser's own outline
       is a different shape on every platform, which is the inconsistency this rule
       exists to remove. */
    ".perch-list__search select:not(.perch-control):focus-visible, .perch-list__search input:not(.perch-control):not(.perch-control__input):focus-visible, .perch-list__size select:focus-visible, .perch-table__cell select:focus-visible":
      {
        outline: "none",
        borderColor: "accent",
        boxShadow: "focus-ring",
      },

    /* A select may hold nothing but options, so the mark that says it opens a
       list sits over a wrapper rather than inside the control. */
    ".perch-picker": {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      minWidth: "0",
    },

    ".perch-picker > select": {
      appearance: "none",
      width: "100%",
      paddingRight: "8",
    },

    ".perch-picker > svg": {
      position: "absolute",
      right: "4",
      /* The control underneath takes the click: the mark is decoration, and a
         reader aiming at it means to open the list. */
      pointerEvents: "none",
      /* Named, not inherited: a mark inherits from its wrapper rather than from the
         control beside it, which gave one shape three weights on one screen. */
      color: "content-muted",
    },

    /* A real input, kept in the accessibility tree and driven by the platform.
       Taken out of sight rather than out of the layout: `display: none` would
       remove it from the tab order along with everything else. */
    ".perch-checkbox": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      minHeight: "control-height",
      position: "relative",
    },

    ".perch-checkbox__input": {
      position: "absolute",
      width: "20px",
      height: "20px",
      margin: "0",
      opacity: "0",
      cursor: "pointer",
    },

    ".perch-checkbox__input:disabled": {
      cursor: "not-allowed",
    },

    ".perch-checkbox__box": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "20px",
      height: "20px",
      flex: "none",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "sm",
      background: "surface",
      color: "content-inverse",
      fontSize: "sm",
      lineHeight: "1",
    },

    ".perch-checkbox__input:checked + .perch-checkbox__box": {
      borderColor: "accent",
      background: "accent",
    },

    /* The ring follows the invisible input, so the focus lands where the reader
       sees the box rather than nowhere at all. */
    ".perch-checkbox__input:focus-visible + .perch-checkbox__box": {
      outline: "2px solid var(--perch-accent)",
      outlineOffset: "2px",
    },

    ".perch-checkbox__input:disabled + .perch-checkbox__box": {
      borderColor: "border",
      background: "surface-muted",
      color: "content-muted",
    },

    /* ------------------------------------------------------------------- view */
    /* The rows of a relation, read. Stacked rather than tabulated: a row here
       holds a handful of labelled values, not a line of columns. */
    ".perch-rows": {
      display: "flex",
      flexDirection: "column",
      gap: "3",
    },

    ".perch-rows__title": {
      margin: "0",
      fontSize: "sm",
      fontWeight: "600",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      color: "content-muted",
    },

    ".perch-rows__row": {
      padding: "4",
      border: "1px solid var(--perch-border)",
      borderRadius: "var(--perch-space-2)",
    },

    /* Said, not left blank: an empty box reads as a page that failed to load. */
    ".perch-rows__empty": {
      margin: "0",
      color: "content-secondary",
      fontSize: "control",
    },

    /* ------------------------------------------------------------ table cells */
    ".perch-cell__images": {
      display: "inline-flex",
      alignItems: "center",
      gap: "2",
    },

    /* Overlapping, which is how a row shows a group in the width of one and a bit. */
    '.perch-cell__images[data-stacked="true"]': {
      gap: "0",
    },

    '.perch-cell__images[data-stacked="true"] > * + *': {
      marginLeft: "-10px",
    },

    ".perch-cell__image": {
      flex: "none",
      border: "1px solid var(--perch-border)",
      borderRadius: "sm",
      background: "surface-muted",
      objectFit: "cover",
    },

    '.perch-cell__image[data-circular="true"]': {
      borderRadius: "50%",
    },

    /* A face, a name and the line under it, drawn as one column — a reader scans
       them as one thing, and three headings is what nobody deciding looks like. */
    ".perch-cell__identity": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      minWidth: "0",
    },

    ".perch-cell__face": {
      flex: "none",
      border: "1px solid var(--perch-border)",
      background: "surface-muted",
      borderRadius: "sm",
      objectFit: "cover",
    },

    '.perch-cell__face[data-circular="true"]': {
      borderRadius: "50%",
    },

    /* Initials where there is no picture, so the column keeps one width down its
       whole length rather than going ragged wherever a face is missing. */
    ".perch-cell__face--empty": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "content-muted",
      fontSize: "sm",
      fontWeight: "500",
      letterSpacing: "0.02em",
    },

    ".perch-cell__named": {
      display: "flex",
      flexDirection: "column",
      minWidth: "0",
    },

    /* Both lines cut rather than wrap: a row that grows a line because one address
       is long is a row that moves everything under it. */
    ".perch-cell__name, .perch-cell__under": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },

    ".perch-cell__under": {
      color: "content-muted",
      fontSize: "sm",
    },

    /* A number drawn as a length, with the number kept beside it.

       The bar answers "which of these is short" without being read; the digits
       answer "how short" for the reader who came for one row. */
    ".perch-cell__gauge": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      minWidth: "0",
    },

    ".perch-cell__gauge-track": {
      flex: "1 1 auto",
      minWidth: "3rem",
      maxWidth: "8rem",
      blockSize: "6px",
      borderRadius: "999px",
      backgroundColor: "surface-sunken",
      overflow: "hidden",
    },

    ".perch-cell__gauge-fill": {
      display: "block",
      blockSize: "100%",
      borderRadius: "inherit",
      backgroundColor: "accent",
    },

    /* Lined up on the digit rather than on the glyph, so a column of numbers reads
       down as a column rather than as a ragged edge. */
    ".perch-cell__gauge-value": {
      flex: "none",
      color: "content-secondary",
      fontSize: "sm",
      fontVariantNumeric: "tabular-nums",
    },

    /* The ones there was no room for, counted. A stack keeps its own edge visible
       against the image it overlaps. */
    ".perch-cell__more": {
      display: "inline-flex",
      flex: "none",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid var(--perch-border)",
      borderRadius: "50%",
      background: "surface-sunken",
      color: "content-secondary",
      fontSize: "sm",
      fontVariantNumeric: "tabular-nums",
    },

    '.perch-cell__images[data-stacked="true"] .perch-cell__image, .perch-cell__images[data-stacked="true"] .perch-cell__more':
      {
        boxShadow: "0 0 0 2px var(--perch-surface)",
      },

    /* A switch in a cell, smaller than the form's. The input is real, taken out
       of sight rather than out of the tab order. */
    ".perch-cell__toggle, .perch-cell__tick": {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
    },

    '.perch-cell__toggle[data-pending="true"], .perch-cell__tick[data-pending="true"]':
      {
        opacity: "0.6",
      },

    ".perch-cell__toggle-input": {
      /* WCAG's pointer target, which for a switch is the switch. */
      width: "34px",
      height: "24px",
      margin: "0",
      borderRadius: "999px",
      appearance: "none",
      background: "surface-sunken",
      border: "1px solid var(--perch-border-strong)",
      cursor: "pointer",
      transition: "background 120ms ease, border-color 120ms ease",
    },

    ".perch-cell__toggle-input::after": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "4px",
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      background: "surface",
      boxShadow: "popover",
      transform: "translateY(-50%)",
      transition: "left 120ms ease",
    },

    ".perch-cell__toggle-input:checked": {
      borderColor: "accent",
      background: "accent",
    },

    ".perch-cell__toggle-input:checked::after": {
      left: "16px",
    },

    ".perch-cell__toggle-input:disabled": {
      cursor: "not-allowed",
      opacity: "0.7",
    },

    ".perch-cell__toggle-input:focus-visible, .perch-cell__tick-input:focus-visible": {
      outline: "none",
      boxShadow: "focus-ring",
    },
    ".perch-cell__tick-input": {
      width: "24px",
      height: "24px",
      margin: "0",
      border: "1px solid var(--perch-border-strong)",
      borderRadius: "sm",
      appearance: "none",
      background: "surface",
      cursor: "pointer",
    },

    ".perch-cell__tick-input:checked": {
      borderColor: "accent",
      background: "accent-surface",
    },

    ".perch-cell__tick-input:disabled": {
      cursor: "not-allowed",
      opacity: "0.7",
    },
    ".perch-cell__tick .perch-cell__mark": {
      position: "absolute",
      left: "0",
      width: "24px",
      color: "accent",
      fontSize: "control",
      lineHeight: "24px",
      textAlign: "center",
      pointerEvents: "none",
    },

    /* A line of text in a cell: the panel's own control, narrower, and never wider
       than the column it sits in. */
    ".perch-cell__line": {
      width: "100%",
      minWidth: "0",
      height: "control-height-sm",
      fontSize: "base",
    },

    '.perch-cell__line[data-pending="true"]': {
      opacity: "0.6",
    },
    ".perch-cell__choice": {
      width: "100%",
      minWidth: "0",
      height: "control-height-sm",
      fontSize: "base",
    },

    '.perch-cell__choice[data-pending="true"]': {
      opacity: "0.6",
    },

    /* A cell at rest is the value it holds: an editable column framing every row
       read as nine controls in a table of three people. The border keeps its 1px
       and loses only its colour, so nothing moves when it comes back.

       Only the resting state. `.perch-control:hover` carries two `:not()` clauses
       and outranks anything a cell can say, so repeating it here would never be
       reached; `:focus-within` ties on specificity, which is why focus is
       restated below rather than inherited and why this surface is declared
       after the control's. */
    ".perch-table__cell .perch-cell__line, .perch-table__cell .perch-cell__choice": {
      height: "auto",
      paddingBlock: "0",
      borderColor: "transparent",
      /* `background-color`, never the shorthand. The chevron is a drawn shape now
         rather than an image on this element, so the shorthand no longer erases it
         — but a control quieting its ground has no business clearing every layer
         under it, and the rule that once did erased the mark for a whole release. */
      backgroundColor: "transparent",
      lineHeight: "inherit",
      paddingInline: "4",
    },

    /* Pulled left by its own padding so the value lines up with the plain text
       beside it, and widened by as much so the frame reaches back out. On the
       wrapper for a choice, not the control: the mark is positioned against the
       wrapper, and pulling the select alone left the chevron a padding inside
       the edge it sits against. */
    ".perch-table__cell .perch-cell__line, .perch-table__cell .perch-picker": {
      marginInline: "calc(-1 * (var(--perch-space-4) + 1px))",
      width: "calc(100% + 2 * (var(--perch-space-4) + 1px))",
    },

    /* The chevron's room, given back: `padding-inline` above is one value for
       both sides, and on a select the right one is where the arrow stands. */
    ".perch-table__cell .perch-cell__choice, .perch-table__cell select": {
      paddingRight: "8",
    },

    /* Focus is not a hint that something can be reached, it is the mark of where
       the reader already is, so it keeps the full frame the rest of the panel uses.
       Restated because the quieting rule above outranks the shared one by order. */
    ".perch-table__cell .perch-cell__line:focus-within, .perch-table__cell .perch-cell__choice:focus-within":
      {
        borderColor: "accent",
        backgroundColor: "surface",
        boxShadow: "focus-ring",
        outline: "none",
      },

    /* A pending write still has to be visible as one, and opacity alone on an
       unframed value is easy to miss. */
    '.perch-table__cell .perch-cell__line[data-pending="true"], .perch-table__cell .perch-cell__choice[data-pending="true"]':
      {
        borderColor: "border",
      },

    /* The browser's own select, given the same quiet. The chevron stays, or a
       column of choices at rest reads as text; `background-color` rather than the
       shorthand, so it survives. */
    ".perch-table__cell select": {
      height: "auto",
      paddingBlock: "0",
      borderColor: "transparent",
      backgroundColor: "transparent",
      lineHeight: "inherit",
    },

    ".perch-table__cell select:focus-visible": {
      backgroundColor: "surface",
    },

    ".perch-cell__colour": {
      display: "inline-flex",
      alignItems: "center",
      gap: "3",
    },

    ".perch-cell__swatch": {
      flex: "none",
      width: "14px",
      height: "14px",
      border: "1px solid var(--perch-border)",
      borderRadius: "sm",
    },

    ".perch-cell__code": {
      fontFamily: "mono",
      fontSize: "base",
    },

    ".perch-cell__copy": {
      /* Centred the way the other two marks are, rather than left in flow: an
         inline SVG sits on a baseline, which put the mark 3px high in a 24px
         button — measured, not guessed. */
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      /* WCAG's pointer target, the floor every other control here keeps. */
      minWidth: "24px",
      minHeight: "24px",
      padding: "0",
      border: "0",
      background: "none",
      color: "content-muted",
      lineHeight: "1",
      cursor: "pointer",
    },

    ".perch-cell__copy:hover": {
      color: "content",
    },

    /* Said on the button itself, because a cell renderer has no state to say it
       with — and taken off again by the timer that put it there. */
    '.perch-cell__copy[data-copied="true"]': {
      color: "accent",
    },

    ".perch-cell__copy-mark": {
      width: "13px",
      height: "13px",
    },

    ".perch-table": {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "base",
      color: "content",
      boxShadow: "panel",
    },

    ".perch-table__head": {
      padding: "var(--perch-space-4) var(--perch-space-5)",
      textAlign: "left",
      fontWeight: "500",
      color: "content-muted",
      borderBottom: "1px solid var(--perch-border-strong)",
      whiteSpace: "nowrap",
    },

    /* A row wider than the window, stacked: each cell carries the heading the
       hidden header row can no longer give it.

       Every rule here undoes one of the table's own at the same specificity, so
       order alone decides. The engine gathers conditional rules after plain ones
       and emits these in the order written — measured, and held by
       `emitted-order.test.ts`, because a release that changed it would take this
       layout apart with nothing failing. */
    ".perch-table, .perch-table tbody, .perch-table tr, .perch-table__cell": {
      _narrow: {
        display: "block",
      },
    },

    /* Off the page rather than `display: none`: the headings are what a screen
       reader announces each cell by, and removing them would take that away from
       the readers who depend on it most. */
    ".perch-table thead": {
      _narrow: {
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
      },
    },

    ".perch-table tr": {
      _narrow: {
        marginBottom: "5",
        border: "1px solid var(--perch-border)",
        borderRadius: "md",
        background: "surface",
      },
    },

    /* Dense on purpose: the operator who reads 200 rows a day comes ahead of the
       developer who reads one screenshot. */
    ".perch-table__cell": {
      padding: "var(--perch-space-4) var(--perch-space-5)",
      borderBottom: "1px solid var(--perch-border-subtle)",
      verticalAlign: "top",
      /* Stacked, the cell is a row of its own, which is why the padding and the
         border above are restated rather than inherited. */
      _narrow: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "4",
        padding: "var(--perch-space-3) var(--perch-space-4)",
        borderBottom: "1px solid var(--perch-border-subtle)",
        textAlign: "right",
      },
    },

    ".perch-table__cell:last-child": {
      _narrow: {
        borderBottom: "none",
      },
    },
    ".perch-table__cell::before": {
      _narrow: {
        content: "attr(data-label)",
        flex: "0 0 auto",
        marginRight: "auto",
        textAlign: "left",
        fontSize: "sm",
        fontWeight: "600",
        color: "content-muted",
      },
    },

    /* Except the two that are not a value: a tick and a row's own controls read
       as themselves, and a label beside them would name a column nobody asked
       about. */
    ".perch-table__actions::before, .perch-table__pick::before": {
      _narrow: {
        content: "none",
      },
    },

    /* A button rather than a click handler on the header, so the keyboard reaches
       it. It carries no chrome of its own. */
    ".perch-table__sort": {
      display: "inline-flex",
      gap: "3",
      alignItems: "center",
      padding: "0",
      background: "none",
      border: "0",
      font: "inherit",
      color: "inherit",
      cursor: "pointer",
    },

    ".perch-table__sort:hover": {
      color: "content",
    },

    ".perch-table__sort-mark": {
      color: "accent",
    },

    ".perch-table__empty": {
      padding: "7",
      textAlign: "center",
      color: "content-muted",
    },

    ".perch-table__empty p": {
      margin: "0",
    },

    /* Over the words rather than beside them, and centred by its own margins: the
       box above centres what it holds with `text-align`, which places inline
       content and does nothing at all to a block. The character it used to hold was
       inline; the drawing is not. */
    ".perch-table__empty-icon": {
      margin: "0 auto var(--perch-space-3)",
      fontSize: "2xl",
    },

    /* Named twice to outweigh the rule above rather than shouted over with
       `!important`, which the next rule here would have to fight again. */
    ".perch-table__empty .perch-table__empty-heading": {
      marginBottom: "2",
      color: "content",
      fontWeight: "600",
    },

    '.perch-cell__icon[data-on="true"]': {
      color: "accent",
    },

    '.perch-cell__icon[data-on="false"]': {
      color: "content-muted",
    },

    /* Development only: a column type with no registered renderer. */
    ".perch-table__unknown": {
      color: "danger-content",
      fontFamily: "mono",
    },

    /* The pairing is `flex` with a control-height minimum, which is right in a
       form row and too tall in a table row. */
    ".perch-table__pick .perch-checkbox": {
      display: "inline-flex",
      minHeight: "0",
    },

    /* As narrow as the control it holds, so the row of data is not pushed across
       the page by a column that carries one checkbox. */
    ".perch-table__pick": {
      width: "1%",
      whiteSpace: "nowrap",
    },

    '.perch-table tr[data-picked="true"]': {
      background: "accent-surface",
    },

    /* Two actions in a cell run together into one word, because nothing between an
       anchor and a button is whitespace. Spaced with a margin rather than by making
       the cell a flex container: `display: flex` takes a `<td>` out of the table's
       box model, and its borders stop lining up with the row it is in. */
    ".perch-table__actions": {
      textAlign: "right",
      whiteSpace: "nowrap",
    },

    ".perch-table__actions > * + *": {
      marginLeft: "6",
    },

    /* A group inside the row menu: a heading, then its items, then a hairline
       under it so the eye can see where one ends. Not a nested menu — a dropdown
       opening out of a dropdown is a shape a pointer loses and a keyboard cannot
       follow. */
    ".perch-table__action-group": {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "1",
      paddingBottom: "2",
      borderBottom: "1px solid var(--perch-border-subtle)",
    },

    ".perch-table__action-group:last-child": {
      paddingBottom: "0",
      borderBottom: "0",
    },

    ".perch-table__action-group-label": {
      display: "flex",
      alignItems: "center",
      gap: "2",
      margin: "0",
      padding: "var(--perch-space-2) var(--perch-space-3) 0",
      color: "content-muted",
      fontSize: "sm",
      fontWeight: "600",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
    },

    ".perch-table__action": {
      color: "accent",
      textDecoration: "none",
    },

    ".perch-table__action:hover": {
      textDecoration: "underline",
    },

    /* A run action is a button; it has to look like the links beside it rather
       than like a form control dropped into a row. */
    "button.perch-table__action": {
      padding: "0",
      border: "0",
      background: "none",
      font: "inherit",
      cursor: "pointer",
    },

    ".perch-table__action--danger": {
      color: "danger",
    },

    "button.perch-table__action:disabled": {
      color: "content-subtle",
      cursor: "not-allowed",
    },

    /* Which edge a column's values sit against.
       Logical properties, not left and right: a panel read right to left puts the
       start of a line on the other side, and a column of numbers pinned to the
       left there is pinned to the wrong end of the row. */
    /* A group's header. Set apart above its rows, and the whole row is one cell
       so the name is not pushed into a column's width. */
    ".perch-table__group-head": {
      padding: "0",
      textAlign: "start",
      fontWeight: "500",
      backgroundColor: "surface-sunken",
      borderBottom: "1px solid var(--perch-border)",
    },

    /* The control is the cell: a header a reader can only reach by clicking a
       triangle is a header a keyboard cannot reach at all. */
    ".perch-table__group-toggle": {
      display: "flex",
      alignItems: "center",
      gap: "4",
      width: "100%",
      padding: "var(--perch-space-3) var(--perch-space-5)",
      border: "0",
      background: "none",
      color: "content",
      font: "inherit",
      textAlign: "start",
      cursor: "pointer",
    },

    ".perch-table__group-toggle:hover": {
      backgroundColor: "surface-muted",
    },

    ".perch-table__group-mark": {
      color: "content-muted",
      fontSize: "xs",
    },

    ".perch-table__group-size": {
      color: "content-muted",
      fontSize: "xs",
      fontVariantNumeric: "tabular-nums",
    },

    /* The footer, which is about every row a filter left rather than about the
       twenty-five on screen. Set apart by a rule above it and a quieter ground,
       because a reader scanning down the rows should be able to tell where the
       rows stop. */
    ".perch-table__foot .perch-table__cell": {
      borderTop: "1px solid var(--perch-border-strong)",
      borderBottom: "none",
      backgroundColor: "surface-sunken",
      whiteSpace: "nowrap",
    },

    /* The name sits above the number rather than beside it: a footer beside a
       narrow column of amounts has no room for both on one line, and wrapping
       mid-label is worse than stacking. */
    ".perch-table__summary-name": {
      display: "block",
      fontSize: "xs",
      color: "content-muted",
    },

    ".perch-table__summary-value": {
      display: "block",
      fontVariantNumeric: "tabular-nums",
      color: "content",
    },

    ".perch-table__head--start, .perch-table__cell--start": {
      textAlign: "start",
    },

    ".perch-table__head--center, .perch-table__cell--center": {
      textAlign: "center",
    },

    ".perch-table__head--end, .perch-table__cell--end": {
      textAlign: "end",
    },

    ".perch-table__head--wide-only, .perch-table__cell--wide-only": {
      _narrow: {
        display: "none",
      },
    },

    /* Words a column shows where the row holds nothing.
       Dimmed, and readable: it is a fact about the row rather than decoration, so
       unlike the dash it is not hidden from a screen reader. */
    ".perch-cell__placeholder": {
      color: "content-muted",
    },
  },

  theme: {
    extend: {
      /**
       * Every token points at the property above it.
       *
       * So a recipe asking for `colors.accent` emits
       * `var(--perch-colors-accent)`, which reads `var(--perch-accent)`, which
       * is what a theme redefines. One indirection, and the published contract
       * untouched.
       */
      /**
       * Every token points at the public property above it.
       *
       * So a recipe asking for `colors.surface` emits
       * `var(--perch-colors-surface)`, which reads `var(--perch-surface)`,
       * which is what a theme redefines. One indirection, and the published
       * contract untouched.
       *
       * Only what a recipe actually reads is here, and that is deliberate
       * rather than lazy: Panda emits an alias for every token declared, and
       * this package refuses to ship a custom property nothing reads. So this
       * list is the record of which surfaces have moved — it grows as they do.
       */
      tokens: {
        colors: {
          accent: { value: "var(--perch-accent)" },
          "accent-hover": { value: "var(--perch-accent-hover)" },
          "accent-border": { value: "var(--perch-accent-border)" },
          "accent-surface": { value: "var(--perch-accent-surface)" },
          border: { value: "var(--perch-border)" },
          "border-hover": { value: "var(--perch-border-hover)" },
          "border-strong": { value: "var(--perch-border-strong)" },
          content: { value: "var(--perch-content)" },
          "content-inverse": { value: "var(--perch-content-inverse)" },
          "content-subtle": { value: "var(--perch-content-subtle)" },
          danger: { value: "var(--perch-danger)" },
          "overlay-scrim": { value: "var(--perch-overlay-scrim)" },
          "pending-border": { value: "var(--perch-pending-border)" },
          "pending-surface": { value: "var(--perch-pending-surface)" },
          "danger-border": { value: "var(--perch-danger-border)" },
          "surface-muted": { value: "var(--perch-surface-muted)" },
          "surface-raised": { value: "var(--perch-surface-raised)" },
          "surface-skeleton-strong": { value: "var(--perch-surface-skeleton-strong)" },
          "content-muted": { value: "var(--perch-content-muted)" },
          "content-secondary": { value: "var(--perch-content-secondary)" },
          "danger-content": { value: "var(--perch-danger-content)" },
          "danger-surface": { value: "var(--perch-danger-surface)" },
          surface: { value: "var(--perch-surface)" },
          "surface-skeleton": { value: "var(--perch-surface-skeleton)" },
          "surface-sunken": { value: "var(--perch-surface-sunken)" },
          "success-content": { value: "var(--perch-success-content)" },
          "success-surface": { value: "var(--perch-success-surface)" },
          "warning-content": { value: "var(--perch-warning-content)" },
          "warning-surface": { value: "var(--perch-warning-surface)" },
        },
        fonts: {
          sans: { value: "var(--perch-font-sans)" },
          mono: { value: "var(--perch-font-mono)" },
        },
        sizes: {
          "control-height": { value: "var(--perch-control-height)" },
          "help-line": { value: "var(--perch-help-line-height)" },
          "control-height-sm": { value: "var(--perch-control-height-sm)" },
        },
        fontSizes: {
          xs: { value: "var(--perch-text-xs)" },
          base: { value: "var(--perch-text-base)" },
          control: { value: "var(--perch-text-control)" },
          lg: { value: "var(--perch-text-lg)" },
          xl: { value: "var(--perch-text-xl)" },
          sm: { value: "var(--perch-text-sm)" },
          "2xl": { value: "var(--perch-text-2xl)" },
        },
        radii: {
          sm: { value: "var(--perch-radius-sm)" },
          md: { value: "var(--perch-radius)" },
          lg: { value: "var(--perch-radius-lg)" },
        },
        shadows: {
          "focus-ring": { value: "var(--perch-focus-ring)" },
          dragging: { value: "var(--perch-shadow-dragging)" },
          overlay: { value: "var(--perch-shadow-overlay)" },
          panel: { value: "var(--perch-shadow-panel)" },
          popover: { value: "var(--perch-shadow-popover)" },
          raised: { value: "var(--perch-shadow-raised)" },
        },
        spacing: {
          1: { value: "var(--perch-space-1)" },
          2: { value: "var(--perch-space-2)" },
          6: { value: "var(--perch-space-6)" },
          8: { value: "var(--perch-space-8)" },
          3: { value: "var(--perch-space-3)" },
          4: { value: "var(--perch-space-4)" },
          5: { value: "var(--perch-space-5)" },
          7: { value: "var(--perch-space-7)" },
        },
      },
      slotRecipes: {
        /**
         * The grid a dashboard lays its widgets on.
         *
         * Four columns, because a widget's `columnSpan` is a count against a
         * grid and a count means nothing without one. A card asks for as many
         * as it wants and gets what there is.
         */
        widgets: {
          className: "perch-widgets",
          slots: ["root", "item"],
          base: {
            root: {
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "6",
              marginBottom: "8",
              // One per row when there is no room for four.
              _narrow: { gridTemplateColumns: "minmax(0, 1fr)" },
            },
            item: {
              display: "grid",
              // As wide as it asked, and as many columns across inside itself:
              // a widget answering three cards in two columns is three cards
              // laid out two and one, rather than three stacked in a column
              // two wide.
              gridTemplateColumns:
                "repeat(var(--perch-widget-span, 1), minmax(0, 1fr))",
              gridColumn: "span var(--perch-widget-span, 1)",
              gap: "6",
              // The span stops being read here. A span of two in a grid one
              // column wide would make itself a second column nothing else is
              // in, and the page would scroll sideways.
              _narrow: { gridColumn: "auto", gridTemplateColumns: "minmax(0, 1fr)" },
            },
          },
        },

        /**
         * One card with a number on it.
         *
         * Named so the classes it emits are the ones the panel already
         * promises. The root is the one that moves: a slot recipe gives every
         * part a suffix, so `.perch-stat` becomes `.perch-stat__root`.
         */
        stat: {
          className: "perch-stat",
          slots: ["root", "head", "label", "icon", "value", "description", "trend"],
          base: {
            root: {
              display: "flex",
              flexDirection: "column",
              gap: "3",
              padding: "7",
              background: "surface",
              borderRadius: "lg",
              boxShadow: "raised",
            },
            head: { display: "flex", alignItems: "center", gap: "4" },
            label: { fontSize: "sm", color: "content-secondary" },
            icon: { marginLeft: "auto", color: "content-muted" },
            value: {
              fontSize: "2xl",
              fontWeight: "600",
              // So a number that changes under a reader does not shift the
              // ones beside it.
              fontVariantNumeric: "tabular-nums",
              color: "content",
            },
            description: {
              display: "flex",
              alignItems: "center",
              gap: "2",
              fontSize: "sm",
              color: "content-secondary",
            },
            trend: { flexShrink: "0" },
          },
          variants: {
            /**
             * The tone colours the quiet line and the arrow on it, never the
             * number: a figure printed in red says the figure is wrong rather
             * than down.
             */
            tone: {
              neutral: { description: { color: "content-secondary" } },
              success: { description: { color: "success-content" } },
              warning: { description: { color: "warning-content" } },
              danger: { description: { color: "danger-content" } },
            },
            /** What the card looks like before its number arrives. */
            state: {
              waiting: {
                root: {
                  minHeight: "80px",
                  background: "surface-skeleton",
                  boxShadow: "none",
                },
              },
              failed: {
                root: {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "5",
                  color: "danger-content",
                  background: "danger-surface",
                  boxShadow: "none",
                },
              },
            },
          },
        },
      },
    },
  },
});
