/**
 * The shapes a control draws instead of typing a character.
 *
 * A glyph is whatever the reader's font decided, at whatever weight it decided,
 * and `▾` next to a drawn chevron is two arrows on one screen — which is what
 * makes one control look like it belongs to another product.
 *
 * `currentColor` throughout, so a mark follows the control it sits in through a
 * hover, a disabled state and both ramps rather than carrying a colour of its
 * own. The stylesheet draws the same chevron for the browser's own selects, and
 * that copy still names a grey: two drawings of one shape is one more than
 * there should be, and the CSS one cannot reach `currentColor` from a data URI.
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

/** Two sheets, one behind the other: what a copy is. */
export function CopyMark(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
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
