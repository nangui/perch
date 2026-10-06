/**
 * The styling system, generated at build time.
 *
 * Panda reads the source, finds the style calls, and writes one plain CSS file.
 * Nothing is injected at run time and nothing is computed in a browser, which
 * is what lets this coexist with the promise the package already makes: the
 * panel ships precompiled and nobody configures a build to install it.
 *
 * Three settings carry most of the reasoning.
 *
 * `preflight: false`, because the panel already resets what it owns, scoped
 * under `.perch-root`. A document-wide reset here would be this package
 * deciding how the other half of somebody's page looks.
 *
 * The dark condition is the panel's own attribute rather than the desktop's
 * preference. That is a decision already taken and written down: the dark ramp
 * is derived rather than designed, so a host asks for it instead of inheriting
 * it from a setting the design was never checked against.
 *
 * And every recipe names its own class. Panda would otherwise invent one, and
 * the architecture promises a stable class on every structural element so a
 * reader can override without forking. A recipe called `perch-stat` with a
 * `label` slot emits `perch-stat__label` — the name that is already there, now
 * generated instead of hand-written.
 *
 * Park UI is not here, and it was meant to be. Its preset declares a peer range
 * that admits Panda 2 and does not work on it: the config it contributes uses
 * array conditions, which 2 removed. Holding the styling engine a major version
 * back to borrow a palette is the worse trade, and the design this panel has is
 * the one below.
 */
import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Written by the build, and ignored by git for the reason any generated
  // directory is.
  outdir: "src/styled-system",
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  /**
   * The base preset, named rather than assumed.
   *
   * It is what maps a property to a token category — `color` to `colors`,
   * `gap` to `spacing`. Without it the recipes below compiled to the token
   * names themselves: `color: contentSecondary`, which is not a colour and not
   * CSS, and which no browser reports.
   */
  presets: ["@pandacss/preset-base"],

  preflight: false,

  /**
   * Emit the recipe whether or not a style call names it.
   *
   * Panda normally writes CSS for what it finds in the source, and nothing in
   * the source reaches for it: the generated helpers import each other without
   * file extensions, which this repository's module resolution refuses, so
   * they stay out of the TypeScript program. What is wanted here is the
   * stylesheet, and this is what asks for all of it.
   */
  staticCss: { recipes: { stat: ["*"] } },

  conditions: {
    extend: {
      /** Stamped by a host that wants it, never read off the machine. */
      dark: '[data-perch-theme="dark"] &',
    },
  },

  theme: {
    extend: {
      tokens: {
        /**
         * The design's own scale, one to ten, which is what `--perch-space-N`
         * already is. Panda's default scale is replaced rather than extended:
         * two spacing scales in one stylesheet is how a panel comes to have
         * two kinds of gap that look nearly the same.
         */
        spacing: {
          1: { value: "2px" },
          2: { value: "4px" },
          3: { value: "6px" },
          4: { value: "8px" },
          5: { value: "10px" },
          6: { value: "12px" },
          7: { value: "16px" },
          8: { value: "20px" },
          9: { value: "24px" },
          10: { value: "32px" },
        },
        fontSizes: {
          xs: { value: "10px" },
          sm: { value: "11px" },
          base: { value: "12px" },
          control: { value: "13px" },
          lg: { value: "14px" },
          xl: { value: "16px" },
          "2xl": { value: "20px" },
        },
        radii: {
          sm: { value: "3px" },
          md: { value: "4px" },
          lg: { value: "6px" },
        },
      },

      /**
       * Both ramps, in one declaration each.
       *
       * This is the half that makes the system worth adopting: a colour is
       * written once with its dark value beside it, where the hand-written
       * sheet keeps the two seventy lines apart and nothing but a test holds
       * them level.
       */
      semanticTokens: {
        colors: {
          surface: { value: { base: "#ffffff", _dark: "#181d20" } },
          surfaceSkeleton: { value: { base: "#e2e6e8", _dark: "#283034" } },
          content: { value: { base: "#14181a", _dark: "#eef0f1" } },
          contentSecondary: { value: { base: "#3c464b", _dark: "#c4cace" } },
          contentMuted: { value: { base: "#6b777d", _dark: "#9aa4a9" } },
          accent: { value: { base: "#21594a", _dark: "#6cbfa5" } },
          successContent: { value: { base: "#15503a", _dark: "#86d0ac" } },
          warningContent: { value: { base: "#6b4700", _dark: "#e5c07b" } },
          dangerContent: { value: { base: "#7d2114", _dark: "#f4a396" } },
          dangerSurface: { value: { base: "#fdf4f2", _dark: "#241412" } },
        },
        shadows: {
          raised: {
            value: {
              base: "0 1px 2px rgb(20 24 26 / 0.06)",
              _dark: "0 1px 2px rgb(0 0 0 / 0.4)",
            },
          },
        },
      },

      slotRecipes: {
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
            label: { fontSize: "sm", color: "contentSecondary" },
            icon: { marginLeft: "auto", color: "contentMuted" },
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
              color: "contentSecondary",
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
              neutral: { description: { color: "contentSecondary" } },
              success: { description: { color: "successContent" } },
              warning: { description: { color: "warningContent" } },
              danger: { description: { color: "dangerContent" } },
            },
            /** What the card looks like before its number arrives. */
            state: {
              waiting: {
                root: {
                  minHeight: "80px",
                  background: "surfaceSkeleton",
                  boxShadow: "none",
                },
              },
              failed: {
                root: {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "5",
                  color: "dangerContent",
                  background: "dangerSurface",
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
