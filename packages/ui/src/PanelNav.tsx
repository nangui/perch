/**
 * The panel's own menu — PRD 03 §4.2 chrome, PRD 04 §6.
 *
 * It renders what it was given and decides nothing. The server has already
 * removed every resource this user may not reach (PRD 04 §5), so an entry
 * missing here is an entry that does not exist for them — not one hidden from
 * them. Filtering on the client would be the second kind, and invariant 8 is
 * about exactly that difference.
 */
import type { ReactNode } from "react";

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
  readonly current?: true;
}

export interface NavigationGroup {
  readonly label?: string;
  readonly items: readonly NavigationItem[];
}

export interface PanelNavProps {
  readonly groups: readonly NavigationGroup[];
}

export function PanelNav({ groups }: PanelNavProps): ReactNode {
  if (groups.length === 0) return null;

  return (
    <nav className="perch-nav" aria-label="Panel">
      {groups.map((group, index) => (
        <div className="perch-nav__group" key={group.label ?? `#${String(index)}`}>
          {group.label === undefined ? null : (
            <h2 className="perch-nav__heading">{group.label}</h2>
          )}
          <ul className="perch-nav__list">
            {group.items.map((item) => (
              <li key={item.href}>
                <a
                  className="perch-nav__link"
                  href={item.href}
                  // The page you are on, said to a screen reader rather than
                  // only drawn.
                  {...(item.current === true
                    ? { "aria-current": "page" as const }
                    : {})}
                >
                  {item.icon === undefined ? null : (
                    <span aria-hidden className="perch-nav__icon">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
