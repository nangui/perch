/**
 * One copy button, for every value an entry offers to copy.
 *
 * A colour entry and a text entry ask the same thing of the same clipboard, and
 * a second button would be a second answer about when it is drawn, what it is
 * called, and what it says after. The one nobody looks at is the one that stops
 * matching.
 */
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * Copies the whole value, and says so.
 *
 * Not rendered where there is no clipboard to write to — an insecure origin, an
 * old browser. A button that cannot do its one job is worse than no button,
 * because the reader tries it.
 */
export function CopyButton({
  value,
  label,
}: {
  readonly value: string;
  readonly label?: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  // Asked of the thing rather than of the name: an insecure origin carries the
  // key with nothing behind it, so `in` answers yes and pressing the button
  // throws. Read through a type that admits it can be missing, because the DOM
  // library says it never is.
  const clipboard = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator
    ?.clipboard;
  if (clipboard === undefined) return null;

  return (
    <button
      type="button"
      className="perch-entry__copy"
      // Named for the entry rather than for its value: a page of buttons all
      // called "Copy" is a list of identical controls to anybody not reading it
      // by eye, and a name built from the value read a whole biography aloud
      // before saying what the button did.
      aria-label={label === undefined || label === "" ? "Copy" : `Copy ${label}`}
      onClick={() => {
        void clipboard.writeText(value).then(
          () => {
            setCopied(true);
          },
          () => {
            // Said nowhere: the value is still on the page to select by hand,
            // and a failure notice on a read page is noise about nothing lost.
          },
        );
      }}
    >
      <span aria-hidden="true">{copied ? "\u2713" : "\u29C9"}</span>
    </button>
  );
}
