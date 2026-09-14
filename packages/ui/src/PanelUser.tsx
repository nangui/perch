/**
 * Who is signed in, in the corner where a reader looks for it.
 *
 * Everything here was decided on the server: the name was read off a principal
 * this half knows nothing about, the items were filtered against what this
 * reader may reach, and every address was checked. What is left is drawing.
 *
 * A `details` rather than a menu built by hand, which is what the column menu
 * next door already is: it opens on a click, closes on Escape, and is
 * announced as a disclosure without a line of JavaScript. A hand-built menu
 * would be the arrow keys, the focus trap and the outside click, written again
 * and worse.
 *
 * With nothing to open, it is not a control. A name alone is a fact, and a
 * button that opens an empty panel is a promise the panel did not make.
 */
import type { ReactNode } from "react";
import { IconMark } from "./icons.js";
import { ChevronDown } from "./marks.js";

export interface PanelUserItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
}

export interface PanelUserMenu {
  readonly name: string;
  readonly description?: string;
  readonly items?: readonly PanelUserItem[];
}

export interface PanelUserProps {
  readonly menu: PanelUserMenu;
}

export function PanelUser({ menu }: PanelUserProps): ReactNode {
  const items = menu.items ?? [];
  const who = (
    <span className="perch-user__who">
      <span className="perch-user__name">{menu.name}</span>
      {menu.description === undefined ? null : (
        <span className="perch-user__description">{menu.description}</span>
      )}
    </span>
  );

  if (items.length === 0) {
    return <div className="perch-user perch-user--plain">{who}</div>;
  }

  return (
    <details className="perch-user">
      {/* Named for what opening it gives, not for the reader: "Ada Lovelace"
          on a button says who, and a reader who cannot see it is owed what
          pressing it does. */}
      <summary className="perch-user__button" aria-label={`Account: ${menu.name}`}>
        {who}
        <span className="perch-user__mark">
          <ChevronDown />
        </span>
      </summary>
      <ul className="perch-user__panel">
        {items.map((item) => (
          <li key={item.href}>
            <a className="perch-user__link" href={item.href}>
              <IconMark name={item.icon} className="perch-user__icon" />
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
