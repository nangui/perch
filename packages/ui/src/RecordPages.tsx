/**
 * The pages one record has, as a strip of links.
 *
 * A record is a form, sometimes a read-only view, and whatever pages its
 * resource declared. Without this they exist at addresses nobody can reach by
 * clicking, which is a feature that works and that nobody uses.
 *
 * The generated pages are in it too. A strip holding only the declared ones
 * would leave a reader on a statistics screen with no way back to the form,
 * and a reader does not think of "Edit" as a different kind of thing from
 * "Stats" — they are both places this record goes.
 *
 * Drawn as a navigation rather than as tabs: these are addresses, and what a
 * link does is exactly what a reader expects of one. Tabs would be a control
 * that looks like it holds state and does not.
 */
import type { ReactNode } from "react";
import { IconMark } from "./icons.js";

export interface RecordPage {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
  readonly current?: true;
}

export interface RecordPagesProps {
  readonly pages: readonly RecordPage[];
}

export function RecordPages({ pages }: RecordPagesProps): ReactNode {
  // One page is nothing to choose between, and a strip of one reads as a
  // control that does not work.
  if (pages.length < 2) return null;

  return (
    <nav className="perch-record-pages" aria-label="This record">
      <ul className="perch-record-pages__list">
        {pages.map((page) => (
          <li key={page.href}>
            <a
              className="perch-record-pages__link"
              href={page.href}
              // The page being read is named as the current one rather than
              // merely drawn differently: a colour is not a thing a reader who
              // cannot see it is told.
              {...(page.current === true ? { "aria-current": "page" as const } : {})}
            >
              <IconMark name={page.icon} className="perch-record-pages__icon" />
              {page.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
