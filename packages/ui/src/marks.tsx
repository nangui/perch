/**
 * The shapes the panel draws for its own slots.
 *
 * A glyph is whatever the reader's font decided, at whatever weight it decided,
 * and `▾` next to a drawn chevron is two arrows on one screen — which is what
 * makes one control look like it belongs to another product.
 *
 * Fitted marks: each is drawn to the slot of one control and sized in pixels
 * there, which is why none of them sits on the uniform grid the named set uses. A select's chevron is wide and short
 * because that is the space it has, and a 16×16 drawing asked for that width
 * would render six pixels of itself in the middle of it.
 *
 * None of these is a name. A resource cannot ask for one, nothing refuses one
 * at boot, and none of them crosses the wire — this is the panel drawing for
 * itself. What a resource asks for by name lives in `./icons.tsx`, and where a
 * mark here turned out to be one of those at another size it is gone from this
 * file: the same path data is never written twice.
 *
 * `currentColor` throughout, so a mark follows the control it sits in through a
 * hover, a disabled state and both ramps rather than carrying a colour of its
 * own.
 */
import type { ReactNode } from "react";

/** The arrow that says a control opens a list. */
export function ChevronDown(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 6"
      width="10"
      height="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 1l4 4 4-4" />
    </svg>
  );
}

/** The three dots that open a row's other actions. */
export function EllipsisMark(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 4"
      width="16"
      height="4"
      fill="currentColor"
    >
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="14" cy="2" r="1.5" />
    </svg>
  );
}

/**
 * The grip on a row that can be dragged.
 *
 * Two columns of dots, which is the shape a hand recognises as something to
 * take hold of — and the reason a braille pattern was standing in for it.
 */
export function GripMark(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 16"
      width="10"
      height="16"
      fill="currentColor"
    >
      <circle cx="3" cy="3" r="1.3" />
      <circle cx="7" cy="3" r="1.3" />
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="7" cy="8" r="1.3" />
      <circle cx="3" cy="13" r="1.3" />
      <circle cx="7" cy="13" r="1.3" />
    </svg>
  );
}

/**
 * The arrow that moves a calendar by a month.
 *
 * Taller than it is wide — 8 by 12 — because it sits in a header beside a month
 * and a year rather than at the end of a line of text. The named
 * `chevron-left` is a square mark on the uniform grid, and put next to this one
 * it would read as a second arrow at a second weight.
 */
export function MonthArrow({ back }: { readonly back: boolean }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 12"
      width="8"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={back ? "M6 1L2 6l4 5" : "M2 1l4 5-4 5"} />
    </svg>
  );
}

/**
 * Which way a folding section is: shut, or open.
 *
 * The last character the panel typed for itself, and the one the guard could
 * not see — it looks for a literal between two tags, and this was an
 * expression choosing between two.
 *
 * Filled rather than stroked. It is drawn at eight pixels beside a heading, and
 * at that size two strokes meeting at a point read as a smudge rather than as a
 * direction. Two drawings rather than one rotated: a rotation is a rule about
 * which way a shape started, and the shape is four points either way.
 */
export function CaretMark({ folded }: { readonly folded: boolean }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 8"
      width="8"
      height="8"
      fill="currentColor"
    >
      <path d={folded ? "M2.5 1l4 3-4 3z" : "M1 2.5l3 4 3-4z"} />
    </svg>
  );
}
