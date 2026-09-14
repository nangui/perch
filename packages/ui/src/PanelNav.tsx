/**
 * The panel's own menu.
 *
 * It renders what it was given and decides nothing. The server has already
 * removed every resource this user may not reach, so an entry missing here is
 * an entry that does not exist for them — not one hidden from them. Filtering
 * on the client would be the second kind, and hiding a control is not a
 * protection.
 */
import { RenderHooks } from "./hooks.js";
import type { ReactNode } from "react";
import { IconMark } from "./icons.js";

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
  /** A count beside the name. Decoration is the icon; this one is read aloud. */
  readonly badge?: string;
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
      <RenderHooks at="sidebar.start" />
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
                  <IconMark name={item.icon} className="perch-nav__icon" />
                  {item.label}
                  {/* Not `aria-hidden`: a number beside a name is the one thing
                      in this menu that is not decoration, and a reader who
                      cannot see it is the reader who most needs telling. */}
                  {item.badge === undefined ? null : (
                    <span className="perch-nav__badge">{item.badge}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <RenderHooks at="sidebar.end" />
    </nav>
  );
}
