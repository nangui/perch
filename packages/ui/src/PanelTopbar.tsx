/**
 * The bar across the top, and whether there is one.
 *
 * Drawn only when something is in it. An empty bar is not a neutral thing: it
 * takes a strip off the top of every page for something nobody asked for, and
 * a panel where nobody declared a user menu and no plugin put anything up
 * there has no business losing the space.
 *
 * So the two hook positions here are the reason it exists as much as the menu
 * is. They were not added until there was a bar to put them in.
 */
import type { ReactNode } from "react";
import { hasRenderHooks, RenderHooks } from "./hooks.js";
import { PanelUser } from "./PanelUser.js";
import type { PanelUserMenu } from "./PanelUser.js";

export interface PanelTopbarProps {
  readonly menu?: PanelUserMenu;
}

export function PanelTopbar({ menu }: PanelTopbarProps): ReactNode {
  const filled =
    menu !== undefined ||
    hasRenderHooks("topbar.start") ||
    hasRenderHooks("topbar.end");
  if (!filled) return null;

  return (
    <header className="perch-topbar">
      <RenderHooks at="topbar.start" />
      {/* Pushed to the far end, which is where a reader looks for their own
          name — and what keeps a plugin's button from landing between the
          name and the edge. */}
      <div className="perch-topbar__end">
        <RenderHooks at="topbar.end" />
        {menu === undefined ? null : <PanelUser menu={menu} />}
      </div>
    </header>
  );
}
