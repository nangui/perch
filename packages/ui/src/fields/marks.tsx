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
