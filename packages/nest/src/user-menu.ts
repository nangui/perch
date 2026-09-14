/**
 * Who is signed in, and what they can do about it.
 *
 * Perch authenticates nobody, so it knows neither what a principal looks like
 * nor where signing out happens. Both are declared: a function that reads a
 * name off whatever the host's guards left behind, and addresses the host
 * owns. A panel that guessed `user.name` would be right in one application
 * and wrong in every other, and one that drew its own "Sign out" would be
 * offering a route nobody wrote.
 *
 * Built per request, like the navigation beside it and for the same reason:
 * two readers are two menus, and one kept across them is one reader's menu
 * shown to another.
 */
import { safeHref } from "@perchjs/core";

/** What the panel was told about the reader, if anything. */
export const PANEL_USER_MENU = Symbol("PERCH_PANEL_USER_MENU");
import type { IconName } from "@perchjs/core";

export interface UserMenuItem {
  readonly label: string;
  /**
   * Where it goes. The host's own route — a profile page, a sign-out endpoint,
   * an identity provider's logout — because none of those are Perch's to
   * write.
   */
  readonly href: string;
  readonly icon?: IconName;
  /**
   * Whether this reader sees it at all.
   *
   * Asked here, on the server, so an item they may not have never reaches the
   * page. Hiding it in the browser would be sending it first.
   */
  readonly visible?: (user: unknown) => boolean | Promise<boolean>;
}

export interface UserMenu {
  /**
   * What to call the reader, read off a principal Perch did not define.
   *
   * Returning nothing means the panel has nobody to name, and draws no menu:
   * a menu headed by a blank is worse than none, because it says somebody is
   * signed in without saying who.
   */
  readonly name: (user: unknown) => string | undefined | Promise<string | undefined>;
  /** A line under the name: an email, a role, the tenant they are in. */
  readonly description?: (
    user: unknown,
  ) => string | undefined | Promise<string | undefined>;
  readonly items?: readonly UserMenuItem[];
}

/** What the browser is given: words and addresses, already decided. */
export interface ResolvedUserMenu {
  readonly name: string;
  readonly description?: string;
  readonly items: readonly ResolvedUserMenuItem[];
}

export interface ResolvedUserMenuItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
}

/**
 * The menu this reader gets, or nothing.
 *
 * Every address is checked here rather than in the browser. These come out of
 * a panel's own configuration rather than out of a row, so the danger is
 * smaller — but `javascript:` in an `href` is the same hole wherever the
 * string came from, and the browser is not the place to find that out.
 */
export async function buildUserMenu(
  menu: UserMenu | undefined,
  user: unknown,
): Promise<ResolvedUserMenu | undefined> {
  if (menu === undefined) return undefined;

  const name = await menu.name(user);
  if (name === undefined || name.trim() === "") return undefined;

  const description = await menu.description?.(user);
  const items: ResolvedUserMenuItem[] = [];
  for (const item of menu.items ?? []) {
    if (item.visible !== undefined && !(await item.visible(user))) continue;
    const href = safeHref(item.href);
    // No address, no entry — the same guard the navigation and the row actions
    // go through. An item that cannot be followed is a control that does
    // nothing, which a reader tries once and then stops trusting.
    if (href === undefined) continue;
    items.push({
      label: item.label,
      href,
      ...(item.icon === undefined ? {} : { icon: item.icon }),
    });
  }

  return {
    name: name.trim(),
    ...(description === undefined || description.trim() === ""
      ? {}
      : { description: description.trim() }),
    items,
  };
}
