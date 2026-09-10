/**
 * The marks a resource may ask the panel to draw.
 *
 * A name rather than a character: a glyph is whatever the reader's font
 * decided, at a weight and a size nobody chose, and an emoji carries colours no
 * theme can reach. A name is resolved to a drawing the panel ships, in
 * `currentColor`, so a mark on a tab and a mark on a button are the same shape
 * at the same weight whoever declared them.
 *
 * Closed on purpose, and small. The set covers what the framework's own
 * surfaces draw and what a record panel asks for; growing it is a change to the
 * framework, which is what keeps it one set rather than a habit. A third
 * party's own mark is not in here and is not meant to be — a plugin draws
 * inside the component it registers, and never asks for one by name.
 *
 * Here rather than in the renderer because the boot has to refuse a name
 * nothing can draw, and the boot runs where this can be read.
 */
export type IconName = (typeof ICON_NAMES)[number];

export const ICON_NAMES = [
  // The ones the panel already draws for itself.
  "calendar",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "copy",
  "ellipsis",
  "grip",
  // What a record panel asks of an action or a tab.
  "plus",
  "pencil",
  "trash",
  "restore",
  "eye",
  "check",
  "close",
  "search",
  "filter",
  "download",
  "upload",
  "link",
  "user",
  "users",
  "tag",
  "star",
  "bell",
  "warning",
  "info",
] as const;

/** Whether a string is a name the panel can draw. */
export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}
