/**
 * The trail back: breadcrumbs are v0.1 chrome.
 *
 * One level, because there is one to show: a resource's list and the page you
 * are on. Nested resources, and the deeper trail they need, are v0.3.
 *
 * A `nav` with a name, because that is what lets a screen reader skip it or
 * find it. The current page is marked and is not a link: linking to where you
 * already are is a control that does nothing.
 */
import type { ReactNode } from "react";

export interface BreadcrumbProps {
  /** The list page. Absent means there is no trail to show. */
  readonly listPath?: string;
  readonly listLabel?: string;
  readonly current: string;
}

export function Breadcrumb({
  listPath,
  listLabel,
  current,
}: BreadcrumbProps): ReactNode {
  if (listPath === undefined) return null;

  return (
    <nav className="perch-breadcrumb" aria-label="Breadcrumb">
      <ol className="perch-breadcrumb__list">
        <li>
          <a className="perch-breadcrumb__link" href={listPath}>
            {listLabel ?? "Back"}
          </a>
        </li>
        <li aria-current="page" className="perch-breadcrumb__current">
          {current}
        </li>
      </ol>
    </nav>
  );
}
