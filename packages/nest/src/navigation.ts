/**
 * The navigation tree.
 *
 * Built on the server, on every request, from the resources the registry holds
 * and the authorization each declares. One security invariant shapes it: *a
 * `viewAny` refusal removes the navigation entry **and** protects the routes*.
 * This file is the first half; the routes already do the second, and neither
 * stands in for the other.
 *
 * So it is rebuilt per request rather than once at boot. Two users see two
 * different panels, and a tree cached across them would be one user's menu
 * shown to another.
 */
import type { RegisteredResource } from "./resource-registry.js";
import { mayReach } from "./authorization.js";
import { resourcePath } from "./records.js";

/** The order the panel declared its groups in. */
export const PANEL_NAVIGATION_GROUPS = Symbol("PANEL_NAVIGATION_GROUPS");

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
  /** True for the resource whose page is being rendered. */
  readonly current?: true;
}

export interface NavigationGroup {
  /** Absent for the items no resource put in a group. */
  readonly label?: string;
  readonly items: readonly NavigationItem[];
}

/**
 * Ungrouped items first, then the groups the panel declared in the order it
 * declared them, then any group a resource named that the panel did not — those
 * alphabetically, because an order nobody stated should at least be stable.
 */
export async function buildNavigation(
  resources: readonly RegisteredResource[],
  user: unknown,
  root: string,
  declaredGroups: readonly string[] = [],
  currentSlug?: string,
): Promise<readonly NavigationGroup[]> {
  const visible: RegisteredResource[] = [];
  for (const resource of resources) {
    if (await mayReach(resource.instance.can, user)) visible.push(resource);
  }

  const byGroup = new Map<string, NavigationItem[]>();
  for (const resource of ordered(visible)) {
    const href = resourcePath(root, resource.metadata.slug);
    // No address, no entry — the same guard the row actions go through.
    if (href === undefined) continue;
    const group = resource.metadata.navigationGroup ?? "";
    const items = byGroup.get(group) ?? [];
    items.push(item(resource, href, currentSlug));
    byGroup.set(group, items);
  }

  return groupOrder(byGroup, declaredGroups).flatMap((label) => {
    const items = byGroup.get(label);
    if (items === undefined || items.length === 0) return [];
    return [label === "" ? { items } : { label, items }];
  });
}

function item(
  resource: RegisteredResource,
  href: string,
  currentSlug: string | undefined,
): NavigationItem {
  const { pluralLabel, icon, slug } = resource.metadata;
  return {
    label: pluralLabel,
    href,
    ...(icon === undefined ? {} : { icon }),
    ...(slug === currentSlug ? { current: true as const } : {}),
  };
}

/** `navigationSort` decides, and the label breaks a tie so the order is stable. */
function ordered(
  resources: readonly RegisteredResource[],
): readonly RegisteredResource[] {
  return [...resources].sort((a, b) => {
    const weight = (a.metadata.navigationSort ?? 0) - (b.metadata.navigationSort ?? 0);
    return weight !== 0
      ? weight
      : a.metadata.pluralLabel.localeCompare(b.metadata.pluralLabel);
  });
}

function groupOrder(
  byGroup: ReadonlyMap<string, unknown>,
  declared: readonly string[],
): readonly string[] {
  const rest = [...byGroup.keys()]
    .filter((label) => label !== "" && !declared.includes(label))
    .sort((a, b) => a.localeCompare(b));
  return ["", ...declared, ...rest];
}
