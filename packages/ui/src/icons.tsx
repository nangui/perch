/**
 * The drawings behind the names a resource is allowed to ask for.
 *
 * `ICON_NAMES` says what may be asked for and the boot refuses the rest; this
 * says what each one looks like. The two halves live apart because the boot
 * runs where the core does and a drawing is a React element — but they are one
 * decision, and `Record<IconName, …>` is what keeps them one: a name added to
 * the core with no drawing here fails this package's build, rather than going
 * quietly missing from a screen.
 *
 * One box and one weight throughout. Every mark is drawn on the same 16×16
 * grid, in `currentColor`, at the same stroke — so a mark on a tab and a mark
 * on a section heading are the same shape at the same weight whoever declared
 * them, which is the whole reason a name was asked for instead of a character.
 *
 * Not the marks in `fields/marks.tsx`. Those are fitted to the slot of one
 * control — a select's chevron is wide and short because that is the space it
 * has — and the panel draws them for itself rather than being asked. Four
 * shapes appear in both places for that reason, and the calendar and the two
 * side chevrons are still drawn a third time inside `DateTimePicker`, which is
 * a slice of its own.
 */
import type { ReactNode } from "react";
import type { IconName } from "@perchjs/core";

/**
 * Filled rather than stroked, for the marks that are dots.
 *
 * The wrapper sets a stroke and no fill, which is what all but a handful of
 * these want. A dot drawn under that rule comes out as a ring.
 */
const FILLED = { fill: "currentColor", stroke: "none" } as const;

/**
 * What each name draws, inside the box the wrapper opens.
 *
 * `Record` and not a lookup with a fallback: the exhaustiveness is the point.
 */
const DRAWINGS: Readonly<Record<IconName, ReactNode>> = {
  // ------------------------------------ the ones the panel draws for itself
  calendar: (
    <>
      <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
      <path d="M2 7h12M5.5 2v3M10.5 2v3" />
    </>
  ),
  "chevron-down": <path d="M3.5 6l4.5 4.5L12.5 6" />,
  "chevron-left": <path d="M10 3l-4.5 5 4.5 5" />,
  "chevron-right": <path d="M6 3l4.5 5-4.5 5" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  ellipsis: (
    <g {...FILLED}>
      <circle cx="3.2" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.8" cy="8" r="1.3" />
    </g>
  ),
  grip: (
    <g {...FILLED}>
      <circle cx="5.6" cy="3.4" r="1.3" />
      <circle cx="10.4" cy="3.4" r="1.3" />
      <circle cx="5.6" cy="8" r="1.3" />
      <circle cx="10.4" cy="8" r="1.3" />
      <circle cx="5.6" cy="12.6" r="1.3" />
      <circle cx="10.4" cy="12.6" r="1.3" />
    </g>
  ),

  // ------------------- what a record panel asks of an action, a tab, a menu
  plus: <path d="M8 3v10M3 8h10" />,
  pencil: (
    <>
      <path d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.4 12.6l-2.8.6.6-2.8z" />
      {/* Where the nib is banded, which is what stops it reading as a dart. */}
      <path d="M10.2 3.8l2 2" />
    </>
  ),
  trash: (
    <>
      <path d="M2.5 4.5h11" />
      <path d="M6.4 4.5V3.2a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.3" />
      <path d="M4 4.5v8a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5v-8" />
    </>
  ),
  restore: (
    <>
      {/* Nearly the whole circle, counter-clockwise: an arrow that closes the
          loop has nowhere to put its head, and a half circle reads as a mood. */}
      <path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8L2.6 5.6" />
      <path d="M2.6 2.6v3h3" />
    </>
  ),
  eye: (
    <>
      <path d="M1.6 8Q4.4 3.9 8 3.9T14.4 8Q11.6 12.1 8 12.1T1.6 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  check: <path d="M3 8.4l3.3 3.3L13 4.6" />,
  close: <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.3 10.3L14 14" />
    </>
  ),
  filter: <path d="M2.4 3.2h11.2l-4.4 5.2v4.2l-2.4 1.2V8.4z" />,
  // One base line under both, so the pair reads as one idea in two directions.
  download: (
    <>
      <path d="M8 2.6v7.6M4.8 7l3.2 3.2L11.2 7" />
      <path d="M2.8 13.4h10.4" />
    </>
  ),
  upload: (
    <>
      <path d="M8 10.2V2.6M4.8 5.8L8 2.6l3.2 3.2" />
      <path d="M2.8 13.4h10.4" />
    </>
  ),
  link: (
    <>
      <path d="M6.7 8.7a3.4 3.4 0 0 0 5 .4l2-2a3.4 3.4 0 0 0-4.7-4.7l-1.1 1.1" />
      <path d="M9.3 7.3a3.4 3.4 0 0 0-5-.4l-2 2a3.4 3.4 0 0 0 4.7 4.7l1.1-1.1" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.4" r="2.8" />
      <path d="M2.9 13.8a5.2 5.2 0 0 1 10.2 0" />
    </>
  ),
  users: (
    <>
      <circle cx="6.2" cy="5.4" r="2.6" />
      <path d="M1.6 13.8a4.7 4.7 0 0 1 9.2 0" />
      {/* The second one is half a head and half a shoulder: two whole people
          at this size are two smudges. */}
      <path d="M10.9 3.2a2.6 2.6 0 0 1 0 4.4" />
      <path d="M12.2 9.6a4 4 0 0 1 2.2 3" />
    </>
  ),
  tag: (
    <>
      <path d="M8.8 3a1.16 1.16 0 0 0-.78-.34H3.82a1.16 1.16 0 0 0-1.16 1.16v4.16a1.16 1.16 0 0 0 .34.82l5.05 5.05a1.41 1.41 0 0 0 1.98 0l3.82-3.82a1.41 1.41 0 0 0 0-1.98z" />
      <circle cx="5.9" cy="5.9" r="1" {...FILLED} />
    </>
  ),
  star: (
    <path d="M8 2.2l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.6l-3.6 1.9.7-4.1-3-2.9 4.1-.6z" />
  ),
  bell: (
    <>
      <path d="M4.6 6.6a3.4 3.4 0 0 1 6.8 0c0 2.9 1.2 3.9 1.2 3.9H3.4s1.2-1 1.2-3.9z" />
      <path d="M6.6 12.7a1.6 1.6 0 0 0 2.8 0" />
    </>
  ),
  warning: (
    <>
      <path d="M7.1 2.9a1 1 0 0 1 1.8 0l5 9.1a1 1 0 0 1-.9 1.5H3a1 1 0 0 1-.9-1.5z" />
      <path d="M8 6.4v3" />
      <circle cx="8" cy="11.3" r="0.8" {...FILLED} />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.4v3.6" />
      <circle cx="8" cy="5.2" r="0.8" {...FILLED} />
    </>
  ),
};

/**
 * The mark for a name, or nothing.
 *
 * Nothing, and not the name: a surface that printed the word when it had no
 * drawing would put `chevron-down` in the middle of a heading. The boot has
 * already refused every name this cannot draw, so the only way here is a
 * declaration that never went through it — a plugin written in JavaScript, a
 * resource's own metadata — and an absent mark is what those get.
 *
 * `aria-hidden` always. A mark carrying meaning of its own would need words
 * beside it, and then the words are what a screen reader should have.
 */
export function IconMark({
  name,
  className,
}: {
  readonly name: string | undefined;
  readonly className: string;
}): ReactNode {
  if (name === undefined) return null;
  const drawing = (DRAWINGS as Readonly<Record<string, ReactNode | undefined>>)[name];
  if (drawing === undefined) return null;

  return (
    <svg
      className={`perch-icon ${className}`}
      aria-hidden="true"
      viewBox="0 0 16 16"
      // The stylesheet is what sizes this. The attributes are here for the one
      // case where it has not loaded: an SVG with no width of its own is 300 by
      // 150, which is a panel with a poster in the middle of it.
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing}
    </svg>
  );
}
