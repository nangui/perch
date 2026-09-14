/**
 * The pictures an infolist shows, at addresses the server already read.
 *
 * It draws what it was handed. Every address arrived minted from a stored key
 * and checked, and a key nothing could answer for never arrived at all — so
 * there is no broken picture to draw here, only fewer of them.
 *
 * `alt` is empty on purpose. These sit inside a `FieldShell` that names them,
 * and a reader who hears the label then hears the same words again from each
 * picture is a reader hearing it twice.
 */
import type { CSSProperties, ReactNode } from "react";

export interface ImageEntryProps {
  /** Addresses, already minted and already read. */
  readonly pictures?: readonly string[];
  readonly circular?: boolean;
  readonly stacked?: boolean;
  readonly size?: number;
  readonly placeholder?: string;
  readonly describedBy?: string;
}

export function ImageEntry({
  pictures,
  circular = false,
  stacked = false,
  size,
  placeholder,
  describedBy,
}: ImageEntryProps): ReactNode {
  if (pictures === undefined || pictures.length === 0) {
    return (
      <p className="perch-entry" data-empty="true" id={describedBy}>
        {placeholder ?? "—"}
      </p>
    );
  }

  return (
    <p
      className="perch-entry perch-entry__pictures"
      data-stacked={stacked ? "true" : undefined}
      id={describedBy}
      {...(size === undefined
        ? {}
        : { style: { "--perch-picture": `${String(size)}px` } as CSSProperties })}
    >
      {pictures.map((src) => (
        <img
          key={src}
          className="perch-entry__picture"
          data-circular={circular ? "true" : undefined}
          src={src}
          alt=""
        />
      ))}
    </p>
  );
}
