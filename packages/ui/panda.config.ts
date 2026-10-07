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
     * designed to lose to every rule that wants the same property, and the
     * ring's own comment said so. That design only holds inside one cascade
     * origin. Left in the hand-written sheet they would be unlayered, and
     * unlayered beats every layer however specific — so the ring would have
     * outranked the control's own focus style it was written to defer to.
     */
    ':where([class^="perch-"], [class*=" perch-"]):focus-visible': {
      outline: "none",
      boxShadow: "focus-ring",
    },

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
          raised: { value: "var(--perch-shadow-raised)" },
        },
        spacing: {
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
            /** The arrow beside the quiet line, which keeps its size. */
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
