/**
 * A colour in an infolist: the patch, and the notation that made it.
 *
 * Both, always. A swatch on its own says "greenish" to a reader who came for
 * the value, and a value on its own is a string nobody pictures.
 *
 * The patch is `aria-hidden`. It carries nothing the code beside it does not
 * already say, and a reader who cannot see it is not missing a colour — they
 * are being spared a second announcement of the same six characters.
 */
import type { ReactNode } from "react";
import { swatchable } from "../colour.js";
import { CopyButton } from "./CopyButton.js";

export interface ColorEntryProps {
  readonly value?: unknown;
  readonly copyable?: boolean;
  /** The entry's own name, for what the copy button is called. */
  readonly label?: string;
  readonly placeholder?: string;
  readonly describedBy?: string;
}

export function ColorEntry({
  value,
  copyable = false,
  label,
  placeholder,
  describedBy,
}: ColorEntryProps): ReactNode {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") {
    return (
      <p className="perch-entry" data-empty="true" id={describedBy}>
        {placeholder ?? "—"}
      </p>
    );
  }

  // Not a colour a style may be given — the row held something else, or
  // something hoping to be obeyed. Shown as the words it is, with no patch:
  // a swatch of the page's own background would read as a colour somebody
  // chose, and this is the case where nobody did.
  const said = swatchable(raw);

  return (
    <p className="perch-entry perch-entry__colour" id={describedBy}>
      {said === undefined ? null : (
        <span
          className="perch-entry__swatch"
          style={{ background: said }}
          aria-hidden
        />
      )}
      <span className="perch-entry__code">{raw}</span>
      {copyable ? (
        <CopyButton value={raw} {...(label === undefined ? {} : { label })} />
      ) : null}
    </p>
  );
}
